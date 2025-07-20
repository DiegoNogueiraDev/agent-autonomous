# BUG-013: Falha no Tratamento de Erros do Singleton Logger e Gestão de Arquivos de Log

## Descrição
O `Logger` implementado como singleton não gerencia corretamente a criação e rotação de arquivos de log, e não implementa mecanismos de recuperação para falhas de escrita. Isso pode resultar em perdas de informações de log importantes e problemas quando múltiplos processos tentam acessar os mesmos arquivos de log simultaneamente.

## Passos para Reprodução
1. Executar múltiplas instâncias do aplicativo simultaneamente
2. Verificar os arquivos de log em `/logs/error.log` e `/logs/combined.log`
3. Criar uma situação onde o diretório de logs não tem permissões de escrita

## Comportamento Esperado
O Logger deve:
1. Verificar e criar o diretório de logs se não existir
2. Implementar mecanismos de bloqueio de arquivo para evitar conflitos entre processos
3. Ter mecanismos de fallback para situações de falha na escrita
4. Permitir configuração externa do diretório de logs

## Comportamento Atual
Analisando o código em `src/core/logger.ts`, observamos que:

```typescript
private constructor() {
  this.logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'datahawk' },
    transports: [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
    ],
  });

  // In development, also log to console
  if (process.env.NODE_ENV !== 'production') {
    this.logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }
}
```

Os problemas incluem:
1. O caminho do arquivo é hardcoded como `'logs/error.log'` e `'logs/combined.log'`
2. Não há verificação se o diretório `logs` existe antes de tentar escrever
3. Não há tratamento para erros de escrita no arquivo de log
4. Não há mecanismo de sincronização entre processos

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Winston: versão no package.json

## Evidências
1. O código não implementa verificação de existência do diretório de logs:
```typescript
// Ausência de código como:
import { mkdir } from 'fs/promises';
await mkdir('logs', { recursive: true });
```

2. Não há tratamento para erros nos métodos de log:
```typescript
public error(message: string, error?: Error | unknown): void {
  if (error instanceof Error) {
    this.logger.error(message, { error: error.message, stack: error.stack });
  } else {
    this.logger.error(message, { error });
  }
  // Sem tratamento para falhas na escrita do log
}
```

3. O singleton é implementado de forma que a configuração não pode ser alterada dinamicamente:
```typescript
public static getInstance(): Logger {
  if (!Logger.instance) {
    Logger.instance = new Logger();
  }
  return Logger.instance;
}
```

## Possível Solução
1. **Adicionar verificação e criação do diretório de logs**:
```typescript
private constructor() {
  // Verificar e criar diretório de logs
  const fs = require('fs');
  const logDir = process.env.LOG_DIR || 'logs';

  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create log directory: ${logDir}`, error);
    }
  }

  // Continuar com a inicialização do Winston...
  this.logger = winston.createLogger({
    // ...configuração
    transports: [
      new winston.transports.File({
        filename: `${logDir}/error.log`,
        // ...outras opções
      }),
      // ...outros transportes
    ],
  });
}
```

2. **Adicionar tratamento de erros e fallback**:
```typescript
private constructor() {
  const logDir = process.env.LOG_DIR || 'logs';

  // Configuração inicial
  const transports = [];

  // Adicionar transporte de arquivo com tratamento de erro
  try {
    transports.push(
      new winston.transports.File({
        filename: `${logDir}/error.log`,
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
        handleExceptions: true
      })
    );

    transports.push(
      new winston.transports.File({
        filename: `${logDir}/combined.log`,
        maxsize: 5242880,
        maxFiles: 5,
        handleExceptions: true
      })
    );
  } catch (error) {
    console.error('Failed to initialize file transports, falling back to console only', error);
  }

  // Sempre adicionar console como fallback em caso de falha dos arquivos
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      handleExceptions: true
    })
  );

  // Inicializar logger
  this.logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'datahawk' },
    transports,
    exitOnError: false // Não encerrar o processo em caso de erro
  });
}
```

3. **Permitir configuração e reinicialização do logger**:
```typescript
// Adicionar método para configuração
public static configure(options: LoggerOptions): void {
  const instance = Logger.getInstance();

  // Remover transportes existentes
  instance.logger.clear();

  // Adicionar novos transportes com base nas opções
  if (options.enableFileLogging) {
    instance.logger.add(
      new winston.transports.File({
        filename: options.errorLogPath || 'logs/error.log',
        level: 'error',
        maxsize: options.maxFileSize || 5242880,
        maxFiles: options.maxFiles || 5
      })
    );

    instance.logger.add(
      new winston.transports.File({
        filename: options.combinedLogPath || 'logs/combined.log',
        maxsize: options.maxFileSize || 5242880,
        maxFiles: options.maxFiles || 5
      })
    );
  }

  if (options.enableConsoleLogging) {
    instance.logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    );
  }

  // Atualizar nível de log
  instance.logger.level = options.level || 'info';
}
```

4. **Implementar mecanismo de bloqueio para acesso multi-processo**:
```typescript
// Usando um arquivo de lock para sincronização entre processos
private acquireLock(): boolean {
  try {
    const fs = require('fs');
    const lockFile = 'logs/.lock';

    // Verificar se o arquivo de lock existe
    if (fs.existsSync(lockFile)) {
      const lockStats = fs.statSync(lockFile);
      const now = Date.now();

      // Se o lock tiver mais de 10 segundos, considerar obsoleto
      if (now - lockStats.mtimeMs > 10000) {
        fs.unlinkSync(lockFile);
      } else {
        return false; // Lock ainda válido, outra instância está escrevendo
      }
    }

    // Criar arquivo de lock
    fs.writeFileSync(lockFile, String(process.pid));
    return true;

  } catch (error) {
    console.error('Failed to acquire log lock', error);
    return false;
  }
}

private releaseLock(): void {
  try {
    const fs = require('fs');
    const lockFile = 'logs/.lock';

    if (fs.existsSync(lockFile)) {
      const content = fs.readFileSync(lockFile, 'utf8');

      // Só remover o lock se foi criado por este processo
      if (content === String(process.pid)) {
        fs.unlinkSync(lockFile);
      }
    }
  } catch (error) {
    console.error('Failed to release log lock', error);
  }
}
```

## Notas Adicionais
A implementação atual do Logger como singleton limita a flexibilidade e a testabilidade do sistema. Além de corrigir os problemas acima, seria benéfico considerar um design que permita:

1. Injeção de dependência do Logger em vez de acesso global via singleton
2. Mock de Logger para testes unitários
3. Configuração de múltiplas instâncias de Logger com diferentes configurações
4. Integração com sistemas externos de log como Elasticsearch, Splunk ou CloudWatch

Uma alternativa seria implementar o Logger usando o padrão de fábrica ou módulo configurável, em vez do singleton rígido atual.
