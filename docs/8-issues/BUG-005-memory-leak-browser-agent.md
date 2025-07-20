# BUG-005: Vazamento de Memória no BrowserAgent

## Descrição
O `BrowserAgent` não está fechando corretamente todas as instâncias e recursos do navegador em determinadas condições de erro, o que pode levar a vazamentos de memória durante execuções prolongadas com múltiplos testes. Isso pode resultar em um aumento gradual do consumo de memória e degradação do desempenho.

## Passos para Reprodução
1. Executar testes ou validações que utilizam o BrowserAgent com um grande volume de dados
2. Observar o uso de memória ao longo do tempo (pode ser monitorado com ferramentas como `top` ou `htop`)
3. Verificar se há processos do navegador Chromium que permanecem em execução após os testes

## Comportamento Esperado
Todas as instâncias do navegador, páginas e contextos devem ser corretamente fechadas após o uso, independentemente de como o fluxo de execução termina (sucesso ou erro). O consumo de memória deve permanecer estável durante execuções prolongadas.

## Comportamento Atual
Análise do código mostra potenciais pontos de vazamento:

```typescript
async cleanup(): Promise<void> {
  if (this.cleanedUp) return;

  try {
    this.logger.debug('Cleaning up browser agent resources');

    if (this.page) {
      await this.page.close().catch(e => this.logger.warn('Error closing page', e));
      this.page = null;
    }

    if (this.context) {
      await this.context.close().catch(e => this.logger.warn('Error closing context', e));
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close().catch(e => this.logger.warn('Error closing browser', e));
      this.browser = null;
    }

    this.cleanedUp = true;
    this.logger.info('Browser agent resources cleaned up');

  } catch (error) {
    this.logger.error('Error during browser agent cleanup', error);
    this.cleanedUp = true; // Marca como limpo mesmo com erro
    throw error;
  }
}
```

Os problemas identificados são:
1. O método marca o agente como `cleanedUp` mesmo quando ocorrem erros
2. Não há verificação explícita se o browser foi realmente fechado
3. O ResourceManager não verifica o status de limpeza real, apenas confia na flag
4. Não há mecanismo de timeout para a operação de fechamento

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Playwright: versão atual no package.json
- Chromium: versão utilizada pelo Playwright

## Evidências
- Processos do Chromium persistem após execuções (verificável via `ps aux | grep chromium`)
- Aumento gradual de memória durante execuções longas
- Implementação atual do método `cleanup()` que pode falhar silenciosamente

## Possível Solução
1. **Implementar verificação robusta de fechamento**:
   ```typescript
   async cleanup(): Promise<void> {
     if (this.cleanedUp) return;

     try {
       this.logger.debug('Cleaning up browser agent resources');

       // Adicionar timeouts para garantir conclusão
       const closeWithTimeout = async (resource: any, name: string, timeoutMs = 5000) => {
         if (!resource) return;

         try {
           const closePromise = resource.close();
           const timeoutPromise = new Promise((_, reject) =>
             setTimeout(() => reject(new Error(`Timeout closing ${name}`)), timeoutMs)
           );

           await Promise.race([closePromise, timeoutPromise]);
         } catch (e) {
           this.logger.error(`Error closing ${name}`, e);
           // Forçar encerramento em último caso
           if (name === 'browser' && this.browser) {
             try {
               // Acesso à API interna para forçar fechamento
               const process = (this.browser as any)._process;
               if (process && typeof process.kill === 'function') {
                 process.kill('SIGKILL');
               }
             } catch (killError) {
               this.logger.error('Failed to force kill browser process', killError);
             }
           }
         }
       };

       // Fechar em ordem reversa com timeouts
       await closeWithTimeout(this.page, 'page');
       this.page = null;

       await closeWithTimeout(this.context, 'context');
       this.context = null;

       await closeWithTimeout(this.browser, 'browser');
       this.browser = null;

       this.cleanedUp = true;
       this.logger.info('Browser agent resources cleaned up successfully');

     } catch (error) {
       this.logger.error('Critical error during browser agent cleanup', error);
       // Não marcar como limpo se houve falha crítica
       throw error;
     }
   }
   ```

2. **Melhorar o ResourceManager**:
   ```typescript
   // No ResourceManager
   async cleanupResource(resource: ManagedResource): Promise<boolean> {
     try {
       await resource.cleanup();

       // Verificação adicional após cleanup
       if (resource.isCleanedUp()) {
         return true;
       }

       this.logger.warn('Resource marked itself as not cleaned up correctly');
       return false;
     } catch (error) {
       this.logger.error('Failed to cleanup resource', error);
       return false;
     }
   }
   ```

3. **Adicionar verificação periódica de processos órfãos**:
   ```typescript
   // Adicionar ao ResourceManager
   startOrphanProcessCheck() {
     setInterval(() => {
       this.checkForOrphanedBrowsers();
     }, 60000); // Verificar a cada minuto
   }

   async checkForOrphanedBrowsers() {
     // Verificar processos do Chrome/Chromium
     // Implementação específica por plataforma
   }
   ```

## Notas Adicionais
Este vazamento de memória pode não ser aparente em execuções curtas ou com poucos dados, mas se torna crítico em ambientes de produção com execuções contínuas ou processamento de grandes volumes de dados. Recomenda-se o uso de ferramentas de monitoramento de memória como parte dos testes de integração contínua para detectar precocemente problemas semelhantes.
