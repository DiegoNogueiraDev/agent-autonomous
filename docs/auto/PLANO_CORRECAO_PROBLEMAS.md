# Plano de Correção - DataHawk Autonomous QA

**Data:** 20/07/2025  
**Objetivo:** Corrigir todos os problemas identificados no projeto  
**Prazo Estimado:** 3-5 dias (atualizado devido às descobertas críticas)  
**Prioridade:** CRÍTICA - Sistema completamente inoperacional  

## Fase 0: Correções de Emergência (Dia 1 - Manhã)

### 0.1 Problemas Críticos de OCR (PRIORIDADE MÁXIMA)

#### 0.1.1 Investigar Problemas do Sharp
**Problema:** `pngload_buffer: libspng read error` em 100% dos testes OCR

**Ações:**
```bash
# Verificar versão do Sharp
npm list sharp

# Verificar dependências do sistema
ldd node_modules/sharp/build/Release/sharp.node

# Reinstalar Sharp com flags corretas
npm uninstall sharp
npm install sharp --build-from-source
```

#### 0.1.2 Implementar Fallbacks para OCR
**Arquivo:** `src/ocr/ocr-engine.ts`

**Correções necessárias:**
```typescript
// Adicionar validação de imagem antes do processamento
async preprocessImage(imageBuffer: Buffer, options: OCRPreprocessingOptions): Promise<Buffer> {
  try {
    // Validar se a imagem é válida
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image dimensions');
    }
    
    // Implementar fallback para imagens corrompidas
    let processedImage = sharp(imageBuffer);
    
    // Aplicar processamento com try-catch para cada operação
    if (options.cropRegion) {
      try {
        processedImage = processedImage.extract(options.cropRegion);
      } catch (error) {
        this.logger.warn('Crop operation failed, skipping', { error });
      }
    }
    
    // ... outros processamentos com try-catch
    
    return await processedImage.toBuffer();
  } catch (error) {
    this.logger.error('Image preprocessing failed', { error });
    // Retornar imagem original como fallback
    return imageBuffer;
  }
}
```

### 0.2 Corrigir Configurações de Validação

#### 0.2.1 Completar Schema de Validação
**Arquivo:** `config/validation.yaml`

**Correções necessárias:**
```yaml
# Adicionar campos obrigatórios ausentes
validationRules:
  fuzzyMatching:
    algorithms: ["levenshtein", "jaro_winkler", "cosine_similarity"]
    numberTolerance: 0.001
  normalization:
    whitespace:
      trimLeading: true
      trimTrailing: true
      normalizeInternal: true
    case:
      email: "lowercase"
      name: "title_case"
      text: "preserve"
    specialCharacters:
      removeAccents: true
      normalizeQuotes: true
      normalizeDashes: true
    numbers:
      decimalSeparator: "."
      thousandSeparator: ","
      currencySymbolRemove: true
    dates:
      targetFormat: "YYYY-MM-DD"
      inputFormats: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]
  errorHandling:
    maxRetryAttempts: 3
    retryDelayMs: 2000
    exponentialBackoff: true
    criticalErrors: ["navigation_timeout", "page_not_found"]
    recoverableErrors: ["element_not_found", "ocr_low_confidence"]
    escalationThreshold: 0.1

performance:
  batchProcessing: true  # Corrigir: era objeto, deve ser boolean
  batchSize: 10
  parallelWorkers: 3
  caching:
    domSnapshots: true
    ocrResults: true
    validationDecisions: false
    ttl: 3600
  timeouts:
    navigation: 30000
    domExtraction: 15000
    ocrProcessing: 45000
    validationDecision: 30000
    evidenceCollection: 10000

evidence:
  retentionDays: 30
  screenshotEnabled: true
  domSnapshotEnabled: true
  compressionEnabled: true
  includeInReports: true
```

## Fase 1: Correções Críticas (Dia 1 - Tarde)

### 1.1 Configuração do Ambiente

#### 1.1.1 Instalar Dependências Ausentes
```bash
# Instalar dependências do TypeScript ESLint
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser

# Verificar se todas as dependências estão instaladas
npm install

# Verificar problemas de Sharp
npm rebuild sharp
```

#### 1.1.2 Corrigir Configuração TypeScript
**Arquivo:** `tsconfig.json`
```json
{
  "compilerOptions": {
    "lib": ["ES2020", "DOM"], // Adicionar DOM para suporte a document/window
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "skipLibCheck": true, // Adicionar para evitar problemas com Sharp
    "esModuleInterop": true
  }
}
```

### 1.2 Correção de Interfaces TypeScript

#### 1.2.1 Atualizar `src/types/index.ts`

**Adicionar propriedades ausentes:**
```typescript
// NavigationResult
interface NavigationResult {
  success: boolean;
  url: string;
  loadTime: number;
  statusCode: number; // Adicionar
  redirectCount: number; // Adicionar
  error?: string;
}

// BrowserAgent
interface BrowserAgent {
  // ... propriedades existentes
  cleanup(): Promise<void>; // Adicionar método
}

// ValidationResult
interface ValidationResult {
  // ... propriedades existentes
  rowIndex?: number; // Adicionar
  validations: ValidationItem[]; // Adicionar array
  errors: ValidationError[]; // Manter como errors, não error
}

// ExtractedWebData
interface ExtractedWebData {
  domData: Record<string, any>;
  ocrData: Record<string, any>;
  screenshots: Screenshot[];
  pageMetadata: PageMetadata;
  extractionMethods: Record<string, ExtractionMethod>;
  timestamp: string;
}

// PageMetadata
interface PageMetadata {
  // ... propriedades existentes
  loadState?: string; // Adicionar
  viewport?: { width: number; height: number }; // Adicionar
}

// Screenshot
interface Screenshot {
  data: string; // Adicionar propriedade data
  type: 'png' | 'jpeg' | 'element' | 'full-page'; // Expandir tipos
  timestamp: string;
  url: string;
}

// ReportSummary
interface ReportSummary {
  // ... propriedades existentes
  performance?: {
    totalTasks: number;
    averageTaskTime: number;
    successRate: number;
  };
}

// ReportStatistics
interface ReportStatistics {
  // ... propriedades existentes
  totalRows: number; // Adicionar
}

// ReportMetadata
interface ReportMetadata {
  // ... propriedades existentes
  configFile?: string; // Adicionar
}

// EvidenceSettings
interface EvidenceSettings {
  // ... propriedades existentes
  retention?: number; // Adicionar
}
```

### 1.3 Implementar Métodos Ausentes

#### 1.3.1 Adicionar método `cleanup()` ao BrowserAgent
**Arquivo:** `src/automation/browser-agent.ts`
```typescript
export class BrowserAgent {
  // ... métodos existentes

  async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
      }
      if (this.page) {
        await this.page.close();
      }
    } catch (error) {
      this.logger.error('Error during browser cleanup', { error });
    }
  }
}
```

#### 1.3.2 Corrigir EnhancedBrowserAgent
**Arquivo:** `src/automation/enhanced-browser-agent.ts`

**Correções necessárias:**
```typescript
// Linha 120, 143 - Adicionar statusCode ao NavigationResult
const result: NavigationResult = {
  success: true,
  url: finalUrl,
  loadTime: Date.now() - startTime,
  statusCode: response?.status() || 0, // Adicionar
  redirectCount: response?.headers()?.['x-redirect-count'] || 0 // Adicionar
};

// Linha 223 - Corrigir tipo de extractionMethods
extractionMethods: extractionMethods as Record<string, ExtractionMethod>,

// Linha 391 - Usar propriedade correta do screenshot
const imageBuffer = Buffer.from(screenshot.data, 'base64');

// Linha 530 - Remover highlight() ou implementar
// await element.highlight(); // Comentar ou remover

// Linha 539, 570 - Corrigir tipos de screenshot
type: 'png' as const, // Usar tipo correto

// Linhas 588-599 - Usar evaluate() para acessar DOM
const pageInfo = await this.page.evaluate(() => ({
  title: document.title,
  url: window.location.href,
  userAgent: navigator.userAgent,
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight
  },
  documentReady: document.readyState,
  elementCount: document.querySelectorAll('*').length,
  formCount: document.querySelectorAll('form').length,
  inputCount: document.querySelectorAll('input').length,
  linkCount: document.querySelectorAll('a').length
}));
```

### 1.4 Corrigir Problemas de Null Safety

#### 1.4.1 TaskMaster
**Arquivo:** `src/core/taskmaster.ts`

**Correções:**
```typescript
// Adicionar verificações de null
if (!this.config) {
  throw new Error('Configuration not loaded');
}

// Usar operadores de coalescência
const targetUrl = this.config?.targetUrl || '';
const fieldMappings = this.config?.fieldMappings || [];

// Corrigir propriedades
const validationResult: ValidationResult = {
  // ... outras propriedades
  validations: [], // Adicionar array vazio
  errors: [], // Usar errors em vez de error
  webData: {
    domData: {},
    ocrData: {},
    screenshots: [],
    pageMetadata: {},
    extractionMethods: {},
    timestamp: new Date().toISOString()
  }
};
```

#### 1.4.2 Local LLM Engine
**Arquivo:** `src/llm/local-llm-engine-new.ts`

**Correções:**
```typescript
// Tratar erros unknown
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to initialize llama-cpp: ${errorMessage}`);
}

// Verificar undefined
const normalized1 = this.normalizeForComparison(csvValue || '');
const normalized2 = this.normalizeForComparison(webValue || '');
```

## Fase 2: Correção de Testes (Dia 2)

### 2.1 Corrigir Testes Unitários

#### 2.1.1 CrewOrchestrator Tests
**Arquivo:** `tests/unit/crew-orchestrator.test.ts`

**Correções necessárias:**
```typescript
// Mock adequado para BrowserAgent
const mockBrowserAgent = {
  navigate: jest.fn(),
  extractData: jest.fn(),
  cleanup: jest.fn(),
  // ... outros métodos
};

// Mock para EvidenceCollector
const mockEvidenceCollector = {
  collectEvidence: jest.fn(),
  // ... outros métodos
};

// Corrigir expectativas de teste
test('should handle navigation failures with retry', async () => {
  // Configurar mock para falhar
  mockBrowserAgent.navigate.mockRejectedValue(new Error('Navigation failed'));
  
  const result = await crewOrchestrator.executeNavigationPhase(mockCsvRow, invalidConfig);
  
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.retryCount).toBeGreaterThan(0);
});

// Corrigir teste de interpolação
test('should interpolate URL templates correctly', async () => {
  const result = await crewOrchestrator.executeNavigationPhase(mockCsvRow, templatedConfig);
  
  // Verificar se a URL foi interpolada
  expect(result.url).toContain('123');
  expect(result.url).not.toContain('{id}');
});
```

#### 2.1.2 Implementar Cleanup Adequado
```typescript
// Adicionar ao beforeEach/afterEach
beforeEach(async () => {
  // Setup
});

afterEach(async () => {
  // Cleanup
  if (crewOrchestrator) {
    await crewOrchestrator.cleanup();
  }
  jest.clearAllMocks();
});
```

### 2.2 Corrigir Testes de OCR

#### 2.2.1 Implementar Mocks para OCR
**Arquivo:** `tests/unit/ocr-engine.test.ts`

**Correções:**
```typescript
// Mock Sharp para evitar problemas de imagem
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
    extract: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    threshold: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image-data')),
  }));
});

// Usar imagens de teste válidas
const validImageBuffer = Buffer.from('fake-valid-image-data');
```

### 2.3 Implementar Testes E2E

#### 2.3.1 Criar Estrutura de Testes E2E
**Arquivo:** `tests/e2e/validation-flow.test.ts`
```typescript
import { test, expect } from '@playwright/test';

test.describe('DataHawk Validation Flow', () => {
  test('should validate CSV data against web interface', async ({ page }) => {
    // Implementar teste E2E completo
    await page.goto('http://localhost:3000');
    
    // Upload CSV
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/test-valid.csv');
    
    // Configurar validação
    await page.fill('input[name="targetUrl"]', 'https://example.com');
    
    // Executar validação
    await page.click('button[type="submit"]');
    
    // Verificar resultados
    await expect(page.locator('.validation-results')).toBeVisible();
  });
});
```

### 2.4 Corrigir Vazamentos de Recursos

#### 2.4.1 Implementar Teardown Adequado
```typescript
// Adicionar ao jest.config.js
export default {
  // ... configuração existente
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  // ... outras configurações
};

// Criar tests/setup.ts
import { jest } from '@jest/globals';

afterAll(async () => {
  // Cleanup global
  await new Promise(resolve => setTimeout(resolve, 500));
});

// Adicionar .unref() aos timers
const timer = setTimeout(() => {}, 1000);
timer.unref();
```

## Fase 3: Otimizações e Melhorias (Dia 3)

### 3.1 Melhorar Logging

#### 3.1.1 Configurar Níveis de Log
**Arquivo:** `src/core/logger.ts`
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Reduzir verbosidade em testes
if (process.env.NODE_ENV === 'test') {
  logger.level = 'error';
}
```

### 3.2 Otimizar Performance

#### 3.2.1 Implementar Pool de Recursos
```typescript
// Criar pool de browsers
class BrowserPool {
  private browsers: Browser[] = [];
  private maxBrowsers = 3;
  
  async getBrowser(): Promise<Browser> {
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await chromium.launch();
      this.browsers.push(browser);
      return browser;
    }
    return this.browsers[0]; // Reutilizar
  }
  
  async cleanup(): Promise<void> {
    await Promise.all(this.browsers.map(b => b.close()));
    this.browsers = [];
  }
}
```

### 3.3 Implementar Funcionalidades Ausentes

#### 3.3.1 Model Management
**Arquivo:** `src/main.ts`

**Implementar funcionalidades TODO:**
```typescript
async function handleModelsCommand(options: any) {
  console.log(chalk.blue.bold('🤖 LLM Model Management\n'));

  if (options.list) {
    console.log('📋 Available Models:');
    console.log('  • Mistral-7B-Instruct-v0.3 (Q4_K_M) - Primary model');
    console.log('  • Tiny-Dolphin-2.8B (Q4_K_M) - Fallback model');
  }

  if (options.download) {
    console.log('📥 Downloading models...');
    // Implementar download de modelos
    await downloadModels();
  }

  if (options.verify) {
    console.log('🔍 Verifying models...');
    // Implementar verificação de modelos
    await verifyModels();
  }
}

async function handleStatusCommand(options: any) {
  console.log(chalk.blue.bold('🔍 DataHawk System Status\n'));

  // Check Node.js version
  const nodeVersion = process.version;
  const requiredNode = '18.0.0';
  console.log(`Node.js: ${nodeVersion} ${nodeVersion >= 'v18.0.0' ? '✅' : '❌'}`);

  // Check Python
  try {
    const { execSync } = await import('child_process');
    const pythonVersion = execSync('python --version', { encoding: 'utf-8' }).trim();
    console.log(`Python: ${pythonVersion} ✅`);
  } catch {
    console.log(`Python: Not found ❌`);
  }

  // Check models if requested
  if (options.models) {
    console.log('\n📦 LLM Models:');
    await checkModelAvailability(); // Implementar
  }

  // Check dependencies if requested
  if (options.deps) {
    console.log('\n📚 Dependencies:');
    await checkDependencies(); // Implementar
  }
}
```

### 3.4 Documentação e Validação

#### 3.4.1 Criar Scripts de Validação
**Arquivo:** `scripts/validate.sh`
```bash
#!/bin/bash

echo "🔍 Validando projeto..."

# Verificar build
echo "📦 Verificando build..."
npm run build

# Executar testes
echo "🧪 Executando testes..."
npm run test:unit
npm run test:integration

# Verificar linting
echo "🔧 Verificando linting..."
npm run lint

# Verificar cobertura
echo "📊 Verificando cobertura..."
npm run test -- --coverage

# Verificar OCR
echo "👁️ Verificando OCR..."
npm run test -- tests/unit/ocr-engine.test.ts

echo "✅ Validação concluída!"
```

## Cronograma de Execução Atualizado

### Dia 1 (Correções de Emergência)
- [ ] 09:00-10:00: Investigar problemas de OCR (Sharp)
- [ ] 10:00-11:00: Implementar fallbacks para OCR
- [ ] 11:00-12:00: Corrigir configurações de validação
- [ ] 12:00-13:00: Almoço
- [ ] 13:00-15:00: Configuração do ambiente
- [ ] 15:00-17:00: Correção de interfaces TypeScript
- [ ] 17:00-18:00: Implementação de métodos ausentes

### Dia 2 (Correção de Testes)
- [ ] 09:00-11:00: Correção de testes unitários
- [ ] 11:00-12:00: Correção de testes de OCR
- [ ] 12:00-13:00: Almoço
- [ ] 13:00-15:00: Implementação de testes E2E
- [ ] 15:00-17:00: Correção de vazamentos de recursos
- [ ] 17:00-18:00: Validação de testes

### Dia 3 (Otimizações)
- [ ] 09:00-11:00: Melhorias de logging
- [ ] 11:00-12:00: Otimizações de performance
- [ ] 12:00-13:00: Almoço
- [ ] 13:00-15:00: Implementar funcionalidades ausentes
- [ ] 15:00-17:00: Scripts de validação
- [ ] 17:00-18:00: Testes finais

### Dia 4 (Testes Extensivos)
- [ ] 09:00-11:00: Testes de integração completos
- [ ] 11:00-12:00: Testes de performance
- [ ] 12:00-13:00: Almoço
- [ ] 13:00-15:00: Testes de stress
- [ ] 15:00-17:00: Validação de funcionalidades
- [ ] 17:00-18:00: Documentação final

### Dia 5 (Deploy e Monitoramento)
- [ ] 09:00-11:00: Preparação para deploy
- [ ] 11:00-12:00: Testes em ambiente de produção
- [ ] 12:00-13:00: Almoço
- [ ] 13:00-15:00: Monitoramento inicial
- [ ] 15:00-17:00: Ajustes finais
- [ ] 17:00-18:00: Entrega

## Critérios de Sucesso Atualizados

### ✅ Build
- [ ] `npm run build` executa sem erros
- [ ] Zero erros de TypeScript
- [ ] Zero warnings críticos

### ✅ Testes
- [ ] Todos os testes unitários passando
- [ ] Testes de integração funcionando
- [ ] Testes E2E implementados e passando
- [ ] Testes de OCR funcionando
- [ ] Cobertura de código > 80%

### ✅ Qualidade
- [ ] ESLint sem erros
- [ ] Zero vazamentos de recursos
- [ ] Logs organizados e informativos
- [ ] Performance aceitável

### ✅ Funcionalidade
- [ ] Navegação funcionando
- [ ] Extração de dados funcionando
- [ ] OCR funcionando
- [ ] Validação funcionando
- [ ] Geração de relatórios funcionando
- [ ] Configurações válidas

### ✅ OCR (NOVO)
- [ ] Processamento de imagens funcionando
- [ ] Fallbacks implementados
- [ ] Zero erros de Sharp
- [ ] Testes de OCR passando

## Riscos e Mitigações Atualizados

### Risco: Problemas de OCR persistentes
**Mitigação:** Implementar múltiplos fallbacks e bibliotecas alternativas

### Risco: Dependências incompatíveis
**Mitigação:** Testar em ambiente isolado antes de aplicar

### Risco: Quebra de funcionalidades existentes
**Mitigação:** Implementar testes de regressão

### Risco: Problemas de performance
**Mitigação:** Monitorar métricas durante correções

### Risco: Falta de tempo
**Mitigação:** Priorizar correções críticas primeiro

### Risco: Configurações inválidas
**Mitigação:** Implementar validação de schema robusta

## Próximos Passos

1. **Revisar plano** com a equipe
2. **Configurar ambiente** de desenvolvimento
3. **Iniciar correções de emergência** (OCR)
4. **Validar progresso** a cada fase
5. **Documentar mudanças** realizadas
6. **Testar funcionalidades** após correções
7. **Implementar monitoramento** contínuo 