# BUG-015: Falha nos Testes E2E Durante Execução com Múltiplas Instâncias

## Descrição
Os testes de integração end-to-end (`tests/integration/e2e-validation.test.ts`) possuem deficiências no gerenciamento de recursos quando executados em paralelo ou em ambiente CI/CD. Os testes não isolam adequadamente os diretórios temporários e recursos compartilhados, causando interferência entre os casos de teste e falhas intermitentes difíceis de reproduzir.

## Passos para Reprodução
1. Executar os testes de integração em paralelo usando `jest --maxWorkers=4`
2. Observar falhas aleatórias em testes que funcionam quando executados isoladamente
3. Verificar logs para identificar conflitos de recursos

## Comportamento Esperado
Os testes de integração devem:
1. Criar ambientes isolados para cada caso de teste
2. Gerenciar corretamente recursos compartilhados (como portas de rede)
3. Limpar todos os recursos após a conclusão, mesmo em caso de falha
4. Funcionar de maneira determinística independente de quantas instâncias estão em execução

## Comportamento Atual
Analisando o código em `tests/integration/e2e-validation.test.ts`, observamos:

```typescript
beforeEach(async () => {
  // Setup temp directory
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-integration-'));
  sampleCsvPath = path.join(tempDir, 'sample.csv');
  sampleConfigPath = path.join(tempDir, 'config.yaml');

  // ... resto do setup
});

afterEach(async () => {
  // Cleanup
  if (taskmaster && typeof taskmaster.cleanup === 'function') {
    await taskmaster.cleanup();
  }
  if (crewOrchestrator && typeof crewOrchestrator.cleanup === 'function') {
    await crewOrchestrator.cleanup();
  }

  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
```

Os problemas incluem:
1. Ausência de timeouts adequados para ambientes CI/CD mais lentos
2. Falta de limpeza forçada (via `afterAll`) quando os testes falham
3. Não há verificação se recursos como portas de rede estão disponíveis antes de iniciar testes
4. Reutilização de recursos globais sem mecanismo de isolamento para execução paralela

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Jest: versão definida no package.json

## Evidências
1. O código cria diretório temporário sem garantir exclusividade entre instâncias:
```typescript
tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-integration-'));
```

2. Não há isolamento de portas de rede ou outros recursos compartilhados entre testes:
```typescript
// Não há código que garanta que várias instâncias não usem a mesma porta
await crewOrchestrator.initialize();
```

3. Ignora erros de limpeza que podem indicar problemas de recursos:
```typescript
try {
  await fs.rm(tempDir, { recursive: true, force: true });
} catch (error) {
  // Ignore cleanup errors
}
```

4. Tempo de timeout insuficiente para ambientes CI/CD mais lentos:
```typescript
}, 45000); // 45 segundos pode ser insuficiente em ambientes de CI/CD
```

## Possível Solução
1. **Implementar identificadores únicos para cada instância de teste**:
```typescript
const testInstanceId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `e2e-integration-${testInstanceId}-`));
```

2. **Usar um gerenciador de portas para garantir que cada teste use uma porta única**:
```typescript
import getPort from 'get-port';

beforeEach(async () => {
  // Obter portas disponíveis para os serviços
  const browserPort = await getPort({ port: getPort.makeRange(9000, 9500) });
  const apiPort = await getPort({ port: getPort.makeRange(8000, 8500) });

  // Usar portas obtidas na configuração
  testConfig = {
    ...baseConfig,
    browserSettings: {
      ...baseConfig.browserSettings,
      port: browserPort
    },
    apiSettings: {
      ...baseConfig.apiSettings,
      port: apiPort
    }
  };
});
```

3. **Garantir limpeza mesmo em caso de falha do teste**:
```typescript
let resources = [];

beforeEach(async () => {
  // ... setup
  resources.push({ type: 'directory', path: tempDir });
  resources.push({ type: 'process', handle: taskmaster });
  resources.push({ type: 'process', handle: crewOrchestrator });
});

afterEach(async () => {
  // Limpar todos os recursos registrados
  for (const resource of resources) {
    try {
      if (resource.type === 'directory') {
        await fs.rm(resource.path, { recursive: true, force: true });
      } else if (resource.type === 'process' && resource.handle?.cleanup) {
        await resource.handle.cleanup();
      }
    } catch (error) {
      console.warn(`Failed to clean up resource: ${error.message}`);
    }
  }
  resources = [];
});

// Backup de limpeza em caso de falhas
afterAll(async () => {
  // Tentar novamente para recursos que possam não ter sido limpos
  if (resources.length > 0) {
    console.warn(`Found ${resources.length} uncleaned resources. Forcing cleanup.`);
    // ... código de limpeza similar ao afterEach
  }
});
```

4. **Aumentar timeouts e adicionar retry para ambientes CI/CD**:
```typescript
// Aumentar timeout para CI/CD
const isCI = process.env.CI === 'true';
const timeoutMultiplier = isCI ? 3 : 1;

test('should execute complete CSV validation workflow', async () => {
  // ... código de teste
}, 60000 * timeoutMultiplier);

// Adicionar retries para testes flaky em CI
if (isCI) {
  jest.retryTimes(2, { logErrorsBeforeRetry: true });
}
```

5. **Implementar verificação de saúde antes de iniciar testes**:
```typescript
beforeAll(async () => {
  // Verificar se o ambiente está pronto para testes
  const healthcheck = async () => {
    try {
      // Verificar disponibilidade de recursos críticos
      const diskSpace = await checkDiskSpace();
      const memoryAvailable = await checkMemoryAvailable();
      const portsAvailable = await checkPortsAvailable([8000, 8080, 9000]);

      return (
        diskSpace.available > 500 * 1024 * 1024 && // 500MB
        memoryAvailable > 1024 * 1024 * 1024 && // 1GB
        portsAvailable
      );
    } catch (error) {
      return false;
    }
  };

  // Tentar até 3 vezes com intervalo
  let ready = false;
  for (let i = 0; i < 3 && !ready; i++) {
    ready = await healthcheck();
    if (!ready && i < 2) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!ready) {
    throw new Error('Environment is not ready for E2E tests. Check system resources.');
  }
});
```

## Notas Adicionais
Testes de integração end-to-end são frequentemente a fonte de falsos positivos em pipelines CI/CD devido à sua dependência de recursos externos e configuração de ambiente. Para torná-los mais robustos, considere:

1. Implementar um sistema de rastreamento de recursos para garantir limpeza adequada
2. Usar containers Docker para isolar cada execução de teste (Docker-in-Docker para CI)
3. Implementar retries inteligentes baseados na natureza da falha
4. Adicionar logs detalhados para facilitar a investigação de falhas intermitentes
5. Separar testes instáveis em uma suíte específica que pode ser executada com mais tempo e recursos

A estratégia ideal seria mover parte destes testes para um sistema de testes de regressão contínua separado da pipeline principal de CI/CD, executando-os periodicamente em vez de em cada commit.
