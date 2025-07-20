# BUG-012: Falha na Limpeza de Arquivos Temporários de Evidência

## Descrição
O sistema não realiza limpeza adequada dos arquivos temporários gerados durante as validações, especialmente screenshots, DOM snapshots e outros arquivos de evidência. Isso resulta em acúmulo contínuo de arquivos temporários que consomem espaço em disco desnecessariamente, podendo eventualmente levar à escassez de espaço em disco em execuções prolongadas.

## Passos para Reprodução
1. Executar múltiplas validações com coleta de evidências ativada
2. Observar a pasta `data/evidence` e seus subdiretórios
3. Verificar que arquivos temporários de validações antigas permanecem mesmo após conclusão dos testes

## Comportamento Esperado
Após a conclusão bem-sucedida da validação e geração dos relatórios, arquivos temporários que não são mais necessários (e que já foram processados e incorporados nos relatórios finais) deveriam ser automaticamente removidos ou gerenciados conforme uma política de retenção configurável.

## Comportamento Atual
Ao analisar o código da `EvidenceCollector` e outros componentes relacionados, não há implementação adequada para gerenciar o ciclo de vida dos arquivos temporários:

1. O `EvidenceCollector` cria diversos arquivos temporários:
```typescript
// Trecho da classe EvidenceCollector
async captureScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${Date.now()}_${name}.png`;
  const filePath = path.join(this.settings.screenshotDir, filename);

  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async saveDomSnapshot(dom: string, name: string): Promise<string> {
  const filename = `${Date.now()}_${name}.html`;
  const filePath = path.join(this.settings.domSnapshotDir, filename);

  await writeFile(filePath, dom, 'utf-8');
  return filePath;
}
```

2. Porém, não há código para limpar estes arquivos após o uso:
```typescript
// Método de limpeza ausente ou inadequado
async cleanup(): Promise<void> {
  // Não implementa limpeza de arquivos temporários
  this.logger.debug('Evidence collector cleanup called');
  // Sem código de limpeza real
}
```

3. O sistema utiliza timestamps como parte dos nomes de arquivo, mas não implementa uma política de expiração ou limpeza baseada nestes timestamps.

## Ambiente
- Sistema de arquivos: Linux/Unix
- Node.js: v18+
- Espaço em disco: Pode se esgotar em ambientes com limitação de espaço

## Evidências
1. Tamanho crescente da pasta `data/evidence` após múltiplas execuções
2. Presença de arquivos antigos (de validações anteriores) na pasta de evidências
3. Ausência de código de limpeza nos componentes principais:
   - Ausência de limpeza automática na `EvidenceCollector`
   - Ausência de rotina de manutenção para arquivos temporários

## Possível Solução
1. **Implementar limpeza imediata após processamento**:
```typescript
// Na classe EvidenceCollector
private tempFilePaths: string[] = [];

// Registrar arquivos temporários
async captureScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${Date.now()}_${name}.png`;
  const filePath = path.join(this.settings.screenshotDir, filename);

  await page.screenshot({ path: filePath, fullPage: true });
  this.tempFilePaths.push(filePath); // Registrar para limpeza posterior
  return filePath;
}

// Implementar limpeza após conclusão
async cleanupTempFiles(): Promise<void> {
  this.logger.debug(`Cleaning up ${this.tempFilePaths.length} temporary files`);

  for (const filePath of this.tempFilePaths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      this.logger.warn(`Failed to delete temporary file: ${filePath}`, error);
    }
  }

  this.tempFilePaths = [];
}

// Implementar métodos de rastreamento e limpeza por sessão
startSession(sessionId: string): void {
  this.currentSessionFiles.set(sessionId, []);
}

registerSessionFile(sessionId: string, filePath: string): void {
  const files = this.currentSessionFiles.get(sessionId) || [];
  files.push(filePath);
  this.currentSessionFiles.set(sessionId, files);
}

cleanupSession(sessionId: string): Promise<void> {
  const files = this.currentSessionFiles.get(sessionId) || [];
  return Promise.all(files.map(file => fs.unlink(file).catch(() => {})))
    .then(() => {
      this.currentSessionFiles.delete(sessionId);
    });
}
```

2. **Implementar uma política de retenção e rotina periódica de limpeza**:
```typescript
// Classe para gerenciar limpeza de arquivos temporários
export class TempFileManager {
  private baseDirs: string[];
  private retentionDays: number;
  private logger: Logger;

  constructor(options: {
    baseDirs: string[],
    retentionDays: number
  }) {
    this.baseDirs = options.baseDirs;
    this.retentionDays = options.retentionDays;
    this.logger = Logger.getInstance();
  }

  // Iniciar limpeza periódica
  startPeriodicCleanup(intervalHours = 24): void {
    setInterval(() => {
      this.cleanupOldFiles()
        .catch(error => this.logger.error('Periodic cleanup failed', error));
    }, intervalHours * 3600 * 1000);
  }

  // Limpar arquivos antigos
  async cleanupOldFiles(): Promise<void> {
    const cutoffTime = Date.now() - (this.retentionDays * 24 * 3600 * 1000);

    for (const baseDir of this.baseDirs) {
      await this.cleanDirectory(baseDir, cutoffTime);
    }
  }

  // Limpar um diretório específico
  private async cleanDirectory(dir: string, cutoffTime: number): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recursivamente limpar subdiretórios
          await this.cleanDirectory(fullPath, cutoffTime);

          // Remover diretórios vazios
          const subEntries = await fs.readdir(fullPath);
          if (subEntries.length === 0) {
            await fs.rmdir(fullPath);
          }
        } else {
          // Verificar idade do arquivo
          const stats = await fs.stat(fullPath);
          if (stats.mtimeMs < cutoffTime) {
            await fs.unlink(fullPath);
            this.logger.debug(`Removed old temporary file: ${fullPath}`);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to clean directory ${dir}`, error);
    }
  }
}
```

3. **Adicionar opções de configuração para controlar retenção**:
```typescript
// Exemplo de configuração adicional
interface EvidenceSettings {
  // Configurações existentes...
  retentionDays: number;
  cleanupOnComplete: boolean;
  compressionEnabled: boolean;
  compressionAfter: number; // Dias antes de comprimir
}

// Uso na inicialização
const tempFileManager = new TempFileManager({
  baseDirs: [
    path.join(process.cwd(), 'data/evidence/screenshots'),
    path.join(process.cwd(), 'data/evidence/dom-snapshots'),
    path.join(process.cwd(), 'data/evidence/temp')
  ],
  retentionDays: settings.retentionDays
});

tempFileManager.startPeriodicCleanup();
```

## Notas Adicionais
O acúmulo de arquivos temporários é especialmente problemático em ambientes de CI/CD, ambientes containerizados, ou servidores com espaço limitado. Além da implementação da limpeza, é importante considerar:

1. Compressão de evidências mais antigas antes da exclusão
2. Indexação de evidências para facilitar referências cruzadas com relatórios antigos
3. Mecanismo para preservar evidências críticas (ex: de falhas importantes) mesmo além do período de retenção

Uma solução robusta não apenas liberará espaço em disco, mas também melhorará o desempenho ao reduzir o número de arquivos nos diretórios, o que pode impactar operações de listagem e busca.
