# BUG-010: Falta de Validação de Configuração no TaskmasterController

## Descrição
O `TaskmasterController`, componente principal responsável pelo processo de validação de dados, não realiza validação adequada das configurações e parâmetros de entrada antes de iniciar as operações. Isso pode levar a falhas em runtime, comportamento imprevisível e resultados incorretos quando configurações incompletas ou inválidas são fornecidas.

## Passos para Reprodução
1. Analisar o código do `src/core/taskmaster.ts`
2. Observar que o método `validateData` aceita configurações sem validar previamente
3. Tentar executar o sistema com uma configuração parcial ou inválida

## Comportamento Esperado
O `TaskmasterController` deve validar rigorosamente todas as configurações de entrada e parâmetros antes de iniciar o processo de validação, lançando erros claros e descritivos quando dados inválidos são encontrados.

## Comportamento Atual
Analisando o código em `src/core/taskmaster.ts`, podemos ver que o método `validateData` aceita configurações sem validação prévia:

```typescript
async validateData(options: {
  inputPath: string;
  configPath: string;
  outputPath: string;
  formats: ReportFormat[];
  maxRows?: number;
  onProgress?: (progress: number) => void;
}): Promise<Report> {
  try {
    // Load configuration
    const { ConfigManager } = await import('./config-manager.js');
    const configManager = new ConfigManager();
    const config = await configManager.loadValidationConfig(options.configPath);

    // Load CSV data
    const csvData = await this.csvLoader.load(options.inputPath);
    let rows = csvData.rows;

    // Apply row limit if specified
    if (options.maxRows && options.maxRows > 0) {
      rows = rows.slice(0, options.maxRows);
    }

    // Initialize engines
    await this.browserAgent.initialize();
    await this.llmEngine.initialize();

    // Resto do método...
  } catch (error) {
    // Tratamento de erro genérico
  }
}
```

Problemas identificados:
1. Não há validação se `options.inputPath` ou `options.configPath` existem como arquivos
2. Não há validação prévia dos formatos de relatório (pode conter formatos inválidos)
3. O método não verifica a compatibilidade entre configuração carregada e dados CSV
4. O método inicializa recursos (browserAgent, llmEngine) sem verificar pré-condições

## Ambiente
- TypeScript: versão no package.json
- Node.js: v18+

## Evidências
1. Ausência de validação no construtor do `TaskmasterController`:
```typescript
constructor(config?: ValidationConfig) {
  this.config = config || null;
  this.logger = Logger.getInstance();
  this.csvLoader = new CSVLoader();
  this.reportGenerator = new ReportGenerator();

  // Inicializa componentes sem validar configuração
  const browserSettings: BrowserSettings = {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    timeout: 30000,
    userAgent: 'DataHawk/1.0'
  };

  this.browserAgent = new BrowserAgent({
    settings: browserSettings,
    headless: true
  });

  // ... mais inicializações sem validação
}
```

2. Ausência de validações adequadas no método `validateData`:
   - Não verifica se os arquivos de entrada existem
   - Não valida os formatos de relatório
   - Não verifica a compatibilidade entre as configurações e os dados

3. Ausência de um método específico para validação de configurações

## Possível Solução
1. **Adicionar validações de pré-condições**:
```typescript
async validateData(options: {
  inputPath: string;
  configPath: string;
  outputPath: string;
  formats: ReportFormat[];
  maxRows?: number;
  onProgress?: (progress: number) => void;
}): Promise<Report> {
  try {
    // Validar existência de arquivos
    await this.validateFilesExist([options.inputPath, options.configPath]);

    // Validar formatos de relatório
    this.validateReportFormats(options.formats);

    // Validar diretório de saída
    await this.ensureOutputDirectoryExists(options.outputPath);

    // Resto do método...
  } catch (error) {
    // Tratamento de erro melhorado
    this.logger.error('Validation preparation failed', error);
    throw new Error(`Failed to prepare validation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

private async validateFilesExist(filePaths: string[]): Promise<void> {
  const fs = await import('fs/promises');

  for (const filePath of filePaths) {
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`File not found or not readable: ${filePath}`);
    }
  }
}

private validateReportFormats(formats: ReportFormat[]): void {
  const validFormats: ReportFormat[] = ['json', 'html', 'markdown', 'csv'];

  for (const format of formats) {
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid report format: ${format}. Valid formats are: ${validFormats.join(', ')}`);
    }
  }
}

private async ensureOutputDirectoryExists(outputPath: string): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    await fs.mkdir(outputPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create output directory: ${outputPath}`);
  }
}
```

2. **Adicionar validação de compatibilidade entre configuração e dados CSV**:
```typescript
private validateConfigurationWithCSV(
  config: ValidationConfig,
  csvData: CSVData
): void {
  // Verificar se todos os campos CSV mencionados na configuração existem nos dados
  const csvHeaders = csvData.metadata.headers;
  const configFields = config.fieldMappings.map(mapping => mapping.csvField);

  const missingFields = configFields.filter(field => !csvHeaders.includes(field));

  if (missingFields.length > 0) {
    throw new Error(
      `Configuration references CSV fields that don't exist in the data: ${missingFields.join(', ')}`
    );
  }

  // Verificar se há ao menos um campo obrigatório para validação
  const hasRequiredFields = config.fieldMappings.some(mapping => mapping.required);

  if (!hasRequiredFields) {
    this.logger.warn('No required fields specified in configuration. All validations will be optional.');
  }
}
```

3. **Adicionar verificação e recuperação de recursos**:
```typescript
private async ensureResourcesInitialized(): Promise<void> {
  if (!this.browserAgent.isInitialized()) {
    try {
      await this.browserAgent.initialize();
    } catch (error) {
      throw new Error(`Failed to initialize browser agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (!this.llmEngine.isInitialized()) {
    try {
      await this.llmEngine.initialize();
    } catch (error) {
      // Tentar fallback para modelo mais leve se disponível
      if (this.llmEngine.hasFallbackModel()) {
        this.logger.warn('Primary LLM failed, attempting fallback model');
        await this.llmEngine.initializeFallback();
      } else {
        throw new Error(`Failed to initialize LLM engine: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
}
```

## Notas Adicionais
A falta de validação adequada no componente principal pode levar a falhas sutis e difíceis de diagnosticar. Muitas vezes, o sistema parecerá funcionar corretamente com configurações parciais, mas produzirá resultados incorretos ou inconsistentes.

A implementação de validações rigorosas irá melhorar significativamente a robustez do sistema, facilitar a depuração quando problemas ocorrerem e fornecer mensagens de erro mais claras e úteis para os usuários.
