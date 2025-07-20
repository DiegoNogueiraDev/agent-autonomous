import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { CrewOrchestrator } from '../../src/agents/crew-orchestrator';
import { TaskmasterController } from '../../src/core/taskmaster';
import type { CrewConfig } from '../../src/types/index';

describe('Validação Avançada - Cenários Complexos', () => {
  let taskmaster: TaskmasterController;
  let crewOrchestrator: CrewOrchestrator;
  let tempDir: string;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complex-validation-'));

    // Initialize components
    taskmaster = new TaskmasterController();

    const crewConfig: CrewConfig = {
      maxConcurrentTasks: 2,
      taskTimeout: 30000,
      retryAttempts: 2,
      agentHealthCheck: true,
      performanceMonitoring: true
    };

    crewOrchestrator = new CrewOrchestrator(crewConfig);
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

  describe('Cenários de Validação de Dados Especiais', () => {
    test('deve validar dados com caracteres especiais', async () => {
      // Criar CSV com caracteres especiais
      const csvPath = path.join(tempDir, 'special-chars.csv');
      const csvContent = `nome,email,telefone,observação
João da Silva,joao@example.com,(11) 98765-4321,Acentuação e çedilha
Maria José,maria@example.com,(21) 99999-8888,Símbolos: @#$%&*()
李小龙,bruce@lee.com,(11) 91234-5678,Caracteres chineses: 你好世界
Emoji Test,emoji@test.com,(31) 88888-7777,Teste com emoji 🚀 e 🔥`;

      await fs.writeFile(csvPath, csvContent);

      // Criar configuração
      const configPath = path.join(tempDir, 'special-config.yaml');
      const configContent = `
targetUrl: "https://httpbin.org/html"
fieldMappings:
  - csvField: "nome"
    webSelector: "h1"
    fieldType: "text"
    required: true
    validationStrategy: "hybrid"
  - csvField: "observação"
    webSelector: "p"
    fieldType: "text"
    required: true
    validationStrategy: "hybrid"
validationRules:
  confidence:
    minimumOverall: 0.6
    minimumField: 0.5
    ocrThreshold: 0.6
    fuzzyMatchThreshold: 0.7
  normalization:
    trimWhitespace: true
    toLowerCase: true
    removeSpecialChars: false
evidence:
  screenshots: true
  domSnapshots: true
`;
      await fs.writeFile(configPath, configContent);

      // Executar validação
      const outputPath = path.join(tempDir, 'output-special');
      await fs.mkdir(outputPath, { recursive: true });

      const result = await taskmaster.validateData({
        inputPath: csvPath,
        configPath: configPath,
        outputPath,
        formats: ['json']
      });

      // Verificações
      expect(result.summary.totalRows).toBe(4);
      expect(result.summary.processedRows).toBe(4);

      // Verificar estrutura do relatório
      expect(result.results).toHaveLength(4);

      // Verificar que o arquivo JSON foi gerado
      const files = await fs.readdir(outputPath);
      expect(files.filter(f => f.endsWith('.json'))).toHaveLength(1);

      // Verificar o conteúdo do relatório JSON
      const reportPath = path.join(outputPath, files.filter(f => f.endsWith('.json'))[0]);
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const report = JSON.parse(reportContent);

      expect(report.summary).toBeDefined();
      expect(report.results).toHaveLength(4);
    }, 60000);

    test('deve lidar com URLs dinâmicos e parâmetros de substituição', async () => {
      // Criar CSV com IDs para URLs dinâmicos
      const csvPath = path.join(tempDir, 'dynamic-urls.csv');
      const csvContent = `id,name,value
1,Product A,99.99
2,Product B,199.99
3,Product C,299.99`;

      await fs.writeFile(csvPath, csvContent);

      // Criar configuração com URL dinâmico
      const configPath = path.join(tempDir, 'dynamic-config.yaml');
      const configContent = `
targetUrl: "https://httpbin.org/anything/{id}"
urlSubstitutionField: "id"
fieldMappings:
  - csvField: "name"
    webSelector: ".product-name"
    fieldType: "text"
    required: true
    validationStrategy: "hybrid"
  - csvField: "value"
    webSelector: ".product-price"
    fieldType: "currency"
    required: true
    validationStrategy: "dom_extraction"
validationRules:
  confidence:
    minimumOverall: 0.7
    minimumField: 0.5
  normalization:
    trimWhitespace: true
evidence:
  screenshots: true
`;
      await fs.writeFile(configPath, configContent);

      // Executar validação
      const outputPath = path.join(tempDir, 'output-dynamic');
      await fs.mkdir(outputPath, { recursive: true });

      const result = await taskmaster.validateData({
        inputPath: csvPath,
        configPath: configPath,
        outputPath,
        formats: ['json']
      });

      // Verificações básicas
      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);
    }, 60000);
  });

  describe('Cenários de Carga e Estresse', () => {
    test('deve lidar com volume moderado de dados', async () => {
      // Criar CSV com volume médio de dados (25 linhas)
      const csvPath = path.join(tempDir, 'medium-volume.csv');
      let csvContent = `id,name,email,phone,address\n`;

      for (let i = 1; i <= 25; i++) {
        csvContent += `${i},User ${i},user${i}@example.com,555-123-${i.toString().padStart(4, '0')},Street ${i} Avenue\n`;
      }

      await fs.writeFile(csvPath, csvContent);

      // Configuração simples
      const configPath = path.join(tempDir, 'volume-config.yaml');
      const configContent = `
targetUrl: "https://httpbin.org/html"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "text"
    required: true
    validationStrategy: "dom_extraction"
performance:
  batchSize: 10
  parallelWorkers: 4
  timeout: 30000
evidence:
  screenshots: true
  domSnapshots: false
`;
      await fs.writeFile(configPath, configContent);

      // Executar validação
      const outputPath = path.join(tempDir, 'output-volume');
      await fs.mkdir(outputPath, { recursive: true });

      const startTime = Date.now();

      const result = await taskmaster.validateData({
        inputPath: csvPath,
        configPath: configPath,
        outputPath,
        formats: ['json'],
        maxRows: 25 // Limitar a 25 para não sobrecarregar o teste
      });

      const duration = Date.now() - startTime;

      // Verificações de performance
      expect(result.summary.totalRows).toBe(25);
      expect(result.summary.processedRows).toBe(25);

      // A duração média por linha deve ser aceitável
      // Ideal: menos de 5 segundos por linha em média
      const avgTimePerRow = duration / result.summary.processedRows;
      console.log(`Tempo médio por linha: ${avgTimePerRow.toFixed(2)}ms`);

      // Não falhar o teste baseado no tempo, apenas registrar
      expect(result.summary.processingTime).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Cenários de Recuperação de Erros', () => {
    test('deve lidar com falhas temporárias e se recuperar', async () => {
      // Criar CSV
      const csvPath = path.join(tempDir, 'error-recovery.csv');
      const csvContent = `id,name,value
1,Product A,99.99
2,Product B,199.99
3,Product C,299.99`;

      await fs.writeFile(csvPath, csvContent);

      // Criar configuração que forçará algumas falhas (URL não existente)
      const configPath = path.join(tempDir, 'error-config.yaml');
      const configContent = `
targetUrl: "https://httpbin.org/status/404"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "text"
    required: true
    validationStrategy: "hybrid"
validationRules:
  errorHandling:
    continueOnError: true
    maxRetries: 2
    fallbackToBasicValidation: true
performance:
  retryAttempts: 3
  retryDelay: 1000
  timeout: 5000
evidence:
  screenshots: true
`;
      await fs.writeFile(configPath, configContent);

      // Executar validação
      const outputPath = path.join(tempDir, 'output-error');
      await fs.mkdir(outputPath, { recursive: true });

      const result = await taskmaster.validateData({
        inputPath: csvPath,
        configPath: configPath,
        outputPath,
        formats: ['json']
      });

      // Verificar que todas as linhas foram processadas mesmo com erros
      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);

      // Verificar taxa de erros
      expect(result.summary.errorRate).toBeGreaterThan(0);

      // Verificar evidências de erros
      const evidencePath = path.join(outputPath, 'evidence');
      const evidenceExists = await fs.access(evidencePath)
        .then(() => true)
        .catch(() => false);

      expect(evidenceExists).toBe(true);
    }, 60000);
  });
});
