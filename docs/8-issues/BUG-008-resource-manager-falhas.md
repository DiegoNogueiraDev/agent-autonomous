# BUG-008: Falhas no ResourceManager Durante Interrupção Abrupta

## Descrição
O `ResourceManager` atual não consegue limpar adequadamente os recursos quando o processo é interrompido abruptamente (SIGINT, SIGTERM) ou durante erros não tratados. Isso resulta em processos fantasmas, arquivos temporários não removidos e potenciais vazamentos de memória.

## Passos para Reprodução
1. Iniciar o processo de validação com vários recursos gerenciados (browser, OCR, etc.)
2. Interromper o processo abruptamente com CTRL+C (SIGINT)
3. Verificar se processos do Chromium, arquivos temporários e outros recursos permaneceram ativos

## Comportamento Esperado
O sistema deveria capturar sinais de interrupção (SIGINT, SIGTERM) e realizar a limpeza ordenada de todos os recursos antes de encerrar o processo, incluindo:
1. Fechamento de todas as instâncias do navegador
2. Finalização de workers do Tesseract OCR
3. Fechamento de conexões com o servidor LLM
4. Remoção de arquivos temporários

## Comportamento Atual
Quando o processo é interrompido, o ResourceManager atual não tem a chance de executar a limpeza, resultando em:
- Processos do Chromium abandonados continuam em execução
- Workers do Tesseract OCR continuam consumindo memória
- Arquivos temporários não são removidos
- Recursos do sistema não são liberados adequadamente

Analisando o código atual do ResourceManager, vemos que ele não implementa manipuladores de sinal:

```typescript
// Implementação atual simplificada do ResourceManager
export class ResourceManager {
  private static instance: ResourceManager;
  private resources: Map<string, ManagedResource> = new Map();

  private constructor() {}

  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
    }
    return ResourceManager.instance;
  }

  registerResource(id: string, resource: ManagedResource): void {
    this.resources.set(id, resource);
  }

  unregisterResource(id: string): void {
    this.resources.delete(id);
  }

  async cleanupResources(): Promise<void> {
    for (const [id, resource] of this.resources.entries()) {
      try {
        await resource.cleanup();
      } catch (error) {
        console.error(`Failed to cleanup resource ${id}`, error);
      }
    }
    this.resources.clear();
  }
}

// Função auxiliar para registrar recursos
export function registerResource(id: string, resource: ManagedResource): void {
  ResourceManager.getInstance().registerResource(id, resource);
}
```

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Playwright: versão no package.json
- Sistema de gestão de processos: Systemd ou similar

## Evidências
1. Processos do Chromium permanecem em execução após interrupção (verificável via `ps aux | grep chromium`)
2. Logs mostram que a função de limpeza não é chamada durante interrupção
3. Arquivos temporários não são removidos do diretório `./data/evidence/`

## Possível Solução
1. **Implementar manipuladores de sinais**:
   ```typescript
   export class ResourceManager {
     private static instance: ResourceManager;
     private resources: Map<string, ManagedResource> = new Map();
     private shuttingDown: boolean = false;
     private logger: Logger;

     private constructor() {
       this.logger = Logger.getInstance();
       this.setupSignalHandlers();
     }

     private setupSignalHandlers(): void {
       // Manipulador para SIGINT (Ctrl+C)
       process.on('SIGINT', async () => {
         this.logger.info('SIGINT received, cleaning up resources...');
         await this.gracefulShutdown();
         process.exit(0);
       });

       // Manipulador para SIGTERM
       process.on('SIGTERM', async () => {
         this.logger.info('SIGTERM received, cleaning up resources...');
         await this.gracefulShutdown();
         process.exit(0);
       });

       // Manipulador para exceções não tratadas
       process.on('uncaughtException', async (error) => {
         this.logger.error('Uncaught exception', error);
         await this.gracefulShutdown();
         process.exit(1);
       });

       // Manipulador para rejeições de promessas não tratadas
       process.on('unhandledRejection', async (reason, promise) => {
         this.logger.error('Unhandled promise rejection', { reason, promise });
         await this.gracefulShutdown();
         process.exit(1);
       });
     }

     async gracefulShutdown(): Promise<void> {
       if (this.shuttingDown) return;

       this.shuttingDown = true;
       this.logger.info(`Starting graceful shutdown, cleaning up ${this.resources.size} resources`);

       // Limpeza com timeout para evitar bloqueio
       const cleanupPromises: Promise<void>[] = [];
       const timeout = 5000; // 5 segundos de timeout

       for (const [id, resource] of this.resources.entries()) {
         const timeoutPromise = new Promise<void>((_, reject) => {
           setTimeout(() => reject(new Error(`Cleanup timeout for resource ${id}`)), timeout);
         });

         const cleanupPromise = Promise.race([
           resource.cleanup().catch(err => {
             this.logger.error(`Error cleaning up resource ${id}`, err);
           }),
           timeoutPromise
         ]).finally(() => {
           this.logger.debug(`Resource ${id} cleanup completed or timed out`);
         });

         cleanupPromises.push(cleanupPromise);
       }

       await Promise.allSettled(cleanupPromises);
       this.resources.clear();
       this.logger.info('All resources cleaned up, shutdown complete');
     }

     // Outros métodos existentes...
   }
   ```

2. **Implementar detecção e limpeza de processos órfãos**:
   ```typescript
   class ProcessMonitor {
     private browserProcessesSnapshot: Map<number, string> = new Map();

     takeProcessSnapshot(): void {
       // Detectar processos do navegador atuais
       const processes = spawnSync('ps', ['aux']).stdout.toString();
       const chromiumRegex = /(\d+)\s+.*chromium.*?--user-data-dir=([^\s]+)/g;
       let match;

       while ((match = chromiumRegex.exec(processes)) !== null) {
         const pid = parseInt(match[1], 10);
         const userDataDir = match[2];
         this.browserProcessesSnapshot.set(pid, userDataDir);
       }
     }

     async killOrphanedProcesses(): Promise<void> {
       const currentProcesses = spawnSync('ps', ['aux']).stdout.toString();

       for (const [pid, userDataDir] of this.browserProcessesSnapshot.entries()) {
         if (currentProcesses.includes(`${pid} `)) {
           try {
             process.kill(pid, 'SIGTERM');
             // Tenta limpar o diretório de dados do usuário
             await fs.rm(userDataDir, { recursive: true, force: true });
           } catch (error) {
             // Ignora erros ao tentar matar processos
           }
         }
       }
     }
   }
   ```

3. **Adicionar um serviço de limpeza periódica**:
   ```typescript
   export class CleanupService {
     private tempDirectories = ['./data/evidence/temp', './data/evidence/videos'];
     private maxAgeMs = 24 * 60 * 60 * 1000; // 24 horas

     async cleanupTempFiles(): Promise<void> {
       const now = Date.now();

       for (const dir of this.tempDirectories) {
         try {
           const files = await fs.readdir(dir);

           for (const file of files) {
             const filePath = path.join(dir, file);
             const stats = await fs.stat(filePath);

             if (now - stats.mtimeMs > this.maxAgeMs) {
               await fs.unlink(filePath);
             }
           }
         } catch (error) {
           // Diretório não existe ou outro erro
         }
       }
     }

     startPeriodicCleanup(intervalMs = 3600000): void {
       setInterval(() => {
         this.cleanupTempFiles().catch(console.error);
       }, intervalMs);
     }
   }
   ```

## Notas Adicionais
Este bug pode levar a problemas significativos em ambientes de produção, incluindo:
- Aumento gradual no consumo de recursos do sistema
- Atingir limites de processos do sistema operacional
- Falhas ao iniciar novos processos devido a recursos não liberados
- Aumento de custo em ambientes de nuvem onde recursos são cobrados por uso

A implementação de uma estratégia robusta de limpeza de recursos é essencial para a estabilidade e eficiência do sistema em execuções de longo prazo.
