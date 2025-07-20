# BUG-006: Duplicação de Código Entre BrowserAgent e EnhancedBrowserAgent

## Descrição
Existe uma quantidade significativa de código duplicado entre as classes `BrowserAgent` e `EnhancedBrowserAgent`. Ambas implementam funcionalidades similares como inicialização do browser, navegação, extração de dados e captura de screenshots, mas com implementações separadas. Isso viola o princípio DRY (Don't Repeat Yourself) e aumenta o risco de bugs de sincronização quando uma classe é atualizada e a outra não.

## Passos para Reprodução
1. Comparar os arquivos `src/automation/browser-agent.ts` e `src/automation/enhanced-browser-agent.ts`
2. Identificar métodos com funcionalidade similar mas implementações separadas
3. Verificar que alterações em um arquivo não são refletidas automaticamente no outro

## Comportamento Esperado
As funcionalidades comuns entre os agentes de browser deveriam ser compartilhadas através de herança, composição ou uma classe base comum. Alterações em funcionalidades compartilhadas deveriam afetar todas as implementações.

## Comportamento Atual
Há duplicação extensa de código entre os dois agentes. Por exemplo:

Inicialização do browser no `BrowserAgent`:
```typescript
async initialize(): Promise<void> {
  try {
    this.logger.debug('Initializing browser agent');

    this.browser = await chromium.launch({
      headless: this.settings.headless,
      slowMo: this.settings.slowMo,
      timeout: this.settings.timeout,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-running-insecure-content'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: this.settings.viewport,
      userAgent: this.settings.userAgent,
      ignoreHTTPSErrors: true,
      recordVideo: { dir: './data/evidence/videos' }
    });

    this.page = await this.context.newPage();

    // Código adicional...
  } catch (error) {
    this.logger.error('Failed to initialize browser agent', error);
    throw error;
  }
}
```

Inicialização do browser no `EnhancedBrowserAgent`:
```typescript
async initialize(): Promise<void> {
  try {
    this.logger.debug('Initializing enhanced browser agent');

    // Initialize browser
    this.browser = await chromium.launch({
      headless: this.settings.headless,
      slowMo: this.settings.slowMo,
      timeout: this.settings.timeout,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-running-insecure-content'
      ]
    });

    // Create context with enhanced settings
    this.context = await this.browser.newContext({
      viewport: this.settings.viewport,
      userAgent: this.settings.userAgent,
      ignoreHTTPSErrors: true,
      // Apenas algumas configurações adicionais aqui
      colorScheme: 'light',
      reducedMotion: 'reduce',
      forcedColors: 'none'
    });

    // Código similar...
  } catch (error) {
    this.logger.error('Failed to initialize enhanced browser agent', error);
    throw error;
  }
}
```

Outros métodos com similaridades significativas incluem:
- Métodos de navegação
- Métodos de captura de screenshots
- Métodos de extração de dados
- Métodos de limpeza de recursos

## Ambiente
- TypeScript: versão no package.json
- Ambiente de desenvolvimento: Qualquer

## Evidências
Análise do código mostra que aproximadamente 60-70% do código entre as duas classes é idêntico ou muito similar, com apenas pequenas diferenças específicas.

## Possível Solução
1. **Criar uma Classe Base Abstrata**:
   ```typescript
   // Criar BaseBrowserAgent.ts
   export abstract class BaseBrowserAgent {
     protected browser: Browser | null = null;
     protected context: BrowserContext | null = null;
     protected page: Page | null = null;
     protected logger: Logger;
     protected settings: BrowserSettings;
     protected cleanedUp: boolean = false;

     constructor(settings: BrowserSettings) {
       this.logger = Logger.getInstance();
       this.settings = settings;
     }

     // Métodos comuns implementados aqui
     async initialize(): Promise<void> {
       // Implementação base
     }

     async navigateToUrl(url: string): Promise<NavigationResult> {
       // Implementação base
     }

     // Métodos que podem ser sobrescritos pelas subclasses
     protected abstract extractFieldValue(mapping: FieldMapping): Promise<any>;

     // Métodos de utilidade compartilhados
     protected interpolateUrl(url: string, rowData?: CSVRow): string {
       // Implementação comum
     }

     // Métodos de gerenciamento de recursos
     async cleanup(): Promise<void> {
       // Implementação comum
     }
   }
   ```

2. **Refatorar as Classes Existentes**:
   ```typescript
   // BrowserAgent.ts
   export class BrowserAgent extends BaseBrowserAgent {
     constructor(options: BrowserAgentOptions) {
       super(options.settings);
       // Configurações específicas
     }

     // Sobrescrever apenas métodos específicos
     protected async extractFieldValue(mapping: FieldMapping): Promise<any> {
       // Implementação específica
     }
   }

   // EnhancedBrowserAgent.ts
   export class EnhancedBrowserAgent extends BaseBrowserAgent {
     private ocrEngine: OCREngine;

     constructor(options: EnhancedBrowserAgentOptions) {
       super(options.settings);
       this.ocrEngine = new OCREngine({ settings: options.ocrSettings });
     }

     // Implementações específicas
     protected async extractFieldValue(mapping: FieldMapping): Promise<any> {
       // Implementação com OCR
     }
   }
   ```

3. **Usar Composição com Estratégias**:
   ```typescript
   // Alternativa baseada em composição
   interface ExtractionStrategy {
     extract(page: Page, mapping: FieldMapping): Promise<any>;
   }

   class DOMExtractionStrategy implements ExtractionStrategy { /* ... */ }
   class OCRExtractionStrategy implements ExtractionStrategy { /* ... */ }

   class BrowserAgentV2 {
     private extractionStrategies: ExtractionStrategy[];

     constructor(strategies: ExtractionStrategy[]) {
       this.extractionStrategies = strategies;
     }

     // Métodos comuns...
   }
   ```

## Notas Adicionais
Este padrão de código duplicado não apenas aumenta a manutenção, mas também torna mais difícil adicionar novas funcionalidades ou corrigir bugs, pois as alterações precisam ser feitas em múltiplos lugares. Adotar uma abordagem orientada a componentes ou baseada em herança ajudará a tornar o código mais sustentável e reduzirá a ocorrência de bugs de sincronização.
