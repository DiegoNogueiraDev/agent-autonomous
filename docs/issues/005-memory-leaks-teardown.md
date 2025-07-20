# Issue 005: Vazamentos de Memória e Cleanup Inadequado

## Problema Identificado
Processos de worker não estão sendo encerrados corretamente, causando vazamentos de memória e necessitando encerramento forçado.

## Detalhes Técnicos
- **Erro específico**: `A worker process has failed to exit gracefully and has been force exited`
- **Causa**: Improper teardown devido a timers ativos ou recursos não liberados
- **Impacto**: Consumo excessivo de memória, instabilidade do sistema

## Análise do Problema
1. **Timers ativos**: `.unref()` não está sendo chamado em timers
2. **Recursos não liberados**: 
   - Conexões de banco de dados
   - Instâncias de browser Puppeteer
   - WebSocket connections
   - File handles

3. **Cleanup incompleto**: Métodos `cleanup()` não estão sendo chamados em todos os componentes

## Componentes Afetados
- **BrowserAgent**: Instâncias do Puppeteer não sendo fechadas
- **LocalLLMEngine**: Conexões com servidor LLM não sendo terminadas
- **CrewOrchestrator**: Agents não sendo destruídos corretamente
- **EvidenceCollector**: Arquivos temporários não sendo removidos

## Solução Proposta
1. **Implementar cleanup adequado**:
   ```typescript
   // Adicionar interface para recursos gerenciáveis
   interface ManagedResource {
     cleanup(): Promise<void>;
     isCleanedUp(): boolean;
   }
   ```

2. **Atualizar classes principais**:
   ```typescript
   class BrowserAgent implements ManagedResource {
     async cleanup(): Promise<void> {
       if (this.browser) {
         await this.browser.close();
         this.browser = null;
       }
       if (this.page) {
         await this.page.close();
         this.page = null;
       }
     }
   }
   ```

3. **Adicionar gerenciamento de recursos**:
   ```typescript
   class ResourceManager {
     private resources: ManagedResource[] = [];
     
     register(resource: ManagedResource): void {
       this.resources.push(resource);
     }
     
     async cleanupAll(): Promise<void> {
       await Promise.all(this.resources.map(r => r.cleanup()));
     }
   }
   ```

4. **Melhorar tratamento de sinais**:
   ```typescript
   process.on('SIGTERM', async () => {
     await resourceManager.cleanupAll();
     process.exit(0);
   });
   ```

## Testes Necessários
1. Adicionar testes de memória usando `process.memoryUsage()`
2. Verificar se todos os recursos são liberados após cada teste
3. Implementar testes de integração para cleanup

## Arquivos para Atualizar
- `src/automation/browser-agent.ts`
- `src/llm/local-llm-engine.ts`
- `src/agents/crew-orchestrator.ts`
- `src/evidence/evidence-collector.ts`
- `src/core/resource-manager.ts` (novo arquivo)
- Adicionar testes de cleanup em todos os testes unitários

## Métricas de Sucesso
- Nenhum warning de "force exited" nos testes
- Memória retornando ao baseline após cada teste
- Todos os recursos sendo liberados corretamente
