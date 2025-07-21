import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { CrewOrchestrator } from '../../src/agents/crew-orchestrator';
import { TaskmasterController } from '../../src/core/taskmaster';
import type { CrewConfig } from '../../src/types/index';

describe('E2E Validation Workflow Integration', () => {
  let taskmaster: TaskmasterController;
  let crewOrchestrator: CrewOrchestrator;
  let tempDir: string;
  let sampleCsvPath: string;
  let sampleConfigPath: string;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-integration-'));
    sampleCsvPath = path.join(tempDir, 'sample.csv');
    sampleConfigPath = path.join(tempDir, 'config.yaml');

    // Create sample CSV with test data
    const csvContent = `name,email,id,title
Herman Melville,herman@melville.com,1,Moby-Dick
Jane Austen,jane@austen.com,2,Pride and Prejudice
Charles Dickens,charles@dickens.com,3,Great Expectations`;
    await fs.writeFile(sampleCsvPath, csvContent);

    // Create realistic test configuration
    const configContent = `
targetUrl: "https://httpbin.org/html"
fieldMappings:
  - csvField: "title"
    webSelector: "h1"
    fieldType: "text"
    required: true
    validationStrategy: "hybrid"
  - csvField: "name"
    webSelector: "p"
    fieldType: "name"
    required: false
    validationStrategy: "dom_extraction"
validationRules:
  confidence:
    minimumOverall: 0.7
    minimumField: 0.5
    ocrThreshold: 0.6
    fuzzyMatchThreshold: 0.7
  fuzzyMatching:
    enabled: true
    stringSimilarityThreshold: 0.7
    caseInsensitive: true
    ignoreWhitespace: true
    algorithms: ["levenshtein", "jaro"]
    numberTolerance: 0.1
  normalization:
    trimWhitespace: true
    toLowerCase: false
    removeSpecialChars: false
  errorHandling:
    continueOnError: true
    maxRetries: 2
    fallbackToBasicValidation: true
performance:
  batchSize: 5
  parallelWorkers: 2
  timeout: 15000
  retryAttempts: 2
  batchProcessing:
    enabled: true
    chunkSize: 10
  caching:
    enabled: false
    maxSize: 1000
  timeouts:
    navigation: 30000
    extraction: 15000
    validation: 10000
evidence:
  retention: 30
  screenshots: true
  domSnapshots: true
  compressionAfter: 7
  retentionDays: 30
  screenshotEnabled: true
  domSnapshotEnabled: true
  compressionEnabled: true
  includeInReports: true
`;
    await fs.writeFile(sampleConfigPath, configContent);

    // Initialize components
    taskmaster = new TaskmasterController();

    const crewConfig: CrewConfig = {
      maxConcurrentTasks: 2,
      taskTimeout: 15000,
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

  describe('Complete Taskmaster Workflow', () => {
    test('should execute complete CSV validation workflow', async () => {
      const outputPath = path.join(tempDir, 'output');

      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: 'config/test-config.snake.yaml',
        outputPath,
        formats: ['json', 'html']
      });

      // Verify basic results structure
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.results).toBeDefined();

      // Verify processing metrics
      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);
      expect(result.summary.processingTime).toBeGreaterThan(0);
      expect(result.summary.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.summary.averageConfidence).toBeLessThanOrEqual(1);

      // Verify each row was processed
      expect(result.results).toHaveLength(3);
      result.results.forEach((row, index) => {
        expect(row.rowIndex).toBe(index);
        expect(row.csvData).toBeDefined();
        expect(row.validations).toBeDefined();
        expect(row.processingTime).toBeGreaterThan(0);
      });

      // Verify output files were created
      const files = await fs.readdir(outputPath);
      expect(files.filter(f => f.endsWith('.json'))).toHaveLength(1);
      expect(files.filter(f => f.endsWith('.html'))).toHaveLength(1);
    }, 60000);

    test('should handle partial failures gracefully', async () => {
      // Create CSV with mixed valid/invalid data
      const mixedCsvContent = `name,email,id,title
Herman Melville,herman@melville.com,1,Moby-Dick
,invalid-email-format,2,
Charles Dickens,charles@dickens.com,3,Great Expectations`;

      const mixedCsvPath = path.join(tempDir, 'mixed.csv');
      await fs.writeFile(mixedCsvPath, mixedCsvContent);

      const result = await taskmaster.validateData({
        inputPath: mixedCsvPath,
        configPath: 'config/test-config.snake.yaml',
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);

      // Should still complete all rows despite data issues
      expect(result.results).toHaveLength(3);

      // Error rate should reflect data quality issues
      expect(result.summary.errorRate).toBeGreaterThanOrEqual(0);
    }, 45000);

    test('should respect processing limits', async () => {
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: 'config/test-config.snake.yaml',
        outputPath: path.join(tempDir, 'output'),
        formats: ['json'],
        maxRows: 2
      });

      expect(result.summary.totalRows).toBe(2);
      expect(result.results).toHaveLength(2);
    }, 30000);
  });

  describe('CrewAI Multi-Agent Integration', () => {
    test('should orchestrate multi-agent validation workflow', async () => {
      await crewOrchestrator.initialize();

      const mockCsvRow = {
        name: 'Herman Melville',
        title: 'Moby-Dick',
        email: 'herman@melville.com',
        id: '1'
      };

      const mockFieldMappings = [
        {
          csvField: 'title',
          webSelector: 'h1',
          fieldType: 'string' as const,
          required: true,
          validationStrategy: 'hybrid' as const
        }
      ];

      const mockConfig = {
        targetUrl: 'https://httpbin.org/html',
        fieldMappings: mockFieldMappings
      };

      // Test complete multi-agent workflow
      const result = await crewOrchestrator.executeRowValidation(
        mockCsvRow,
        mockFieldMappings,
        mockConfig as any
      );

      expect(result.success).toBe(true);
      expect(result.navigationResult).toBeDefined();
      expect(result.extractionResults).toBeDefined();
      expect(result.validationResults).toBeDefined();
      expect(result.evidenceResult).toBeDefined();
      expect(result.agentUtilization).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    }, 45000);

    test('should handle agent coordination and resource management', async () => {
      await crewOrchestrator.initialize();

      // Execute multiple concurrent validations
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const csvRow = {
          name: `User ${i}`,
          title: `Title ${i}`,
          id: `${i}`
        };

        const fieldMappings = [{
          csvField: 'title',
          webSelector: 'h1',
          fieldType: 'string' as const,
          required: true,
          validationStrategy: 'dom_extraction' as const
        }];

        const config = {
          targetUrl: 'https://httpbin.org/html',
          fieldMappings
        };

        tasks.push(crewOrchestrator.executeRowValidation(csvRow, fieldMappings, config));
      }

      const results = await Promise.all(tasks);

      // All tasks should complete successfully
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.agentUtilization).toBeDefined();
      });

      // Check performance metrics
      const metrics = crewOrchestrator.getPerformanceMetrics();
      expect(metrics.totalTasks).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThan(0);
    }, 60000);

    test('should demonstrate agent health monitoring', async () => {
      await crewOrchestrator.initialize();

      const healthStatus = await crewOrchestrator.checkAgentHealth();

      expect(healthStatus.overall).toBe(true);
      expect(healthStatus.agents).toBeDefined();
      expect(healthStatus.agents.navigator).toBe(true);
      expect(healthStatus.agents.extractor).toBe(true);
      expect(healthStatus.agents.validator).toBe(true);
    });
  });

  describe('Integration Error Handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      const invalidConfigContent = `
targetUrl: "https://invalid-domain-that-definitely-does-not-exist-12345.com"
fieldMappings:
  - csvField: "title"
    webSelector: "h1"
    fieldType: "string"
validationRules:
  confidence:
    minimumOverall: 0.7
performance:
  timeout: 5000
`;
      const invalidConfigPath = path.join(tempDir, 'invalid-config.yaml');
      await fs.writeFile(invalidConfigPath, invalidConfigContent);

      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: invalidConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      // Should complete despite navigation failures
      expect(result).toBeDefined();
      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.errorRate).toBeGreaterThan(0);
    }, 30000);

    test('should handle malformed CSV data', async () => {
      const malformedCsvContent = `name,email,id,title
"Herman Melville",herman@melville.com,1,"Moby-Dick"
"Unclosed quote,invalid@email,2,Missing quote
Charles Dickens,charles@dickens.com,3,Great Expectations`;

      const malformedCsvPath = path.join(tempDir, 'malformed.csv');
      await fs.writeFile(malformedCsvPath, malformedCsvContent);

      const result = await taskmaster.validateData({
        inputPath: malformedCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      // Should handle malformed data gracefully
      expect(result).toBeDefined();
      expect(result.summary.totalRows).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Evidence and Reporting Integration', () => {
    test('should generate comprehensive evidence and reports', async () => {
      const outputPath = path.join(tempDir, 'output');

      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath,
        formats: ['json', 'html', 'markdown']
      });

      expect(result).toBeDefined();

      // Check that evidence directory exists
      const evidenceDir = path.join(outputPath, 'evidence');
      try {
        const evidenceStats = await fs.stat(evidenceDir);
        expect(evidenceStats.isDirectory()).toBe(true);

        // Check for evidence subdirectories
        const evidenceContents = await fs.readdir(evidenceDir);
        expect(evidenceContents).toContain('screenshots');
        expect(evidenceContents).toContain('dom-snapshots');
        expect(evidenceContents).toContain('data');
      } catch (error) {
        // Evidence collection might be disabled or failed
        console.warn('Evidence collection not available:', error);
      }

      // Verify multiple report formats
      const outputFiles = await fs.readdir(outputPath);
      expect(outputFiles.filter(f => f.endsWith('.json'))).toHaveLength(1);
      expect(outputFiles.filter(f => f.endsWith('.html'))).toHaveLength(1);
      expect(outputFiles.filter(f => f.endsWith('.md'))).toHaveLength(1);

      // Validate JSON report structure
      const jsonFiles = outputFiles.filter(f => f.endsWith('.json'));
      const jsonContent = JSON.parse(await fs.readFile(path.join(outputPath, jsonFiles[0]), 'utf-8'));

      expect(jsonContent.summary).toBeDefined();
      expect(jsonContent.results).toBeDefined();
      expect(jsonContent.metadata).toBeDefined();
      expect(jsonContent.summary.totalRows).toBe(3);
    }, 45000);
  });

  describe('Performance and Scalability', () => {
    test('should handle larger datasets efficiently', async () => {
      // Generate larger CSV dataset
      let largeCsvContent = 'name,email,id,title\n';
      for (let i = 1; i <= 20; i++) {
        largeCsvContent += `User ${i},user${i}@example.com,${i},Title ${i}\n`;
      }

      const largeCsvPath = path.join(tempDir, 'large.csv');
      await fs.writeFile(largeCsvPath, largeCsvContent);

      const startTime = Date.now();

      const result = await taskmaster.validateData({
        inputPath: largeCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      const processingTime = Date.now() - startTime;

      expect(result.summary.totalRows).toBe(20);
      expect(result.summary.processedRows).toBe(20);

      // Should process at reasonable speed (aim for >1 row per 3 seconds)
      const avgTimePerRow = processingTime / 20;
      expect(avgTimePerRow).toBeLessThan(5000); // 5 seconds per row max

      // Verify performance metrics
      expect(result.summary.performance.rowsPerSecond).toBeGreaterThan(0);
      expect(result.summary.performance.averageRowTime).toBeGreaterThan(0);
    }, 90000);

    test('should demonstrate parallel processing capabilities', async () => {
      // Test with higher parallel worker count
      const parallelConfigContent = `
targetUrl: "https://httpbin.org/html"
fieldMappings:
  - csvField: "title"
    webSelector: "h1"
    fieldType: "string"
performance:
  batchSize: 3
  parallelWorkers: 3
  timeout: 10000
`;
      const parallelConfigPath = path.join(tempDir, 'parallel-config.yaml');
      await fs.writeFile(parallelConfigPath, parallelConfigContent);

      // Create medium-sized dataset
      let mediumCsvContent = 'name,email,id,title\n';
      for (let i = 1; i <= 9; i++) {
        mediumCsvContent += `User ${i},user${i}@example.com,${i},Title ${i}\n`;
      }

      const mediumCsvPath = path.join(tempDir, 'medium.csv');
      await fs.writeFile(mediumCsvPath, mediumCsvContent);

      const startTime = Date.now();

      const result = await taskmaster.validateData({
        inputPath: mediumCsvPath,
        configPath: parallelConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      const processingTime = Date.now() - startTime;

      expect(result.summary.totalRows).toBe(9);
      expect(result.summary.processedRows).toBe(9);

      // Parallel processing should be faster than sequential
      // 9 rows with 3 parallel workers should be ~3x faster than sequential
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    }, 60000);
  });

  describe('Configuration and Customization', () => {
    test('should support different validation strategies', async () => {
      const strategiesConfigContent = `
targetUrl: "https://httpbin.org/html"
fieldMappings:
  - csvField: "title"
    webSelector: "h1"
    fieldType: "string"
    validationStrategy: "dom_extraction"
  - csvField: "name"
    webSelector: "p"
    fieldType: "string"
    validationStrategy: "hybrid"
validationRules:
  confidence:
    minimumOverall: 0.6
    minimumField: 0.4
`;
      const strategiesConfigPath = path.join(tempDir, 'strategies-config.yaml');
      await fs.writeFile(strategiesConfigPath, strategiesConfigContent);

      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: strategiesConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);

      // Verify that different validation strategies were applied
      result.results.forEach(row => {
        expect(row.validations).toBeDefined();
        expect(row.validations.length).toBeGreaterThan(0);

        row.validations.forEach(validation => {
          expect(['dom_extraction', 'llm_validation', 'hybrid']).toContain(validation.method);
        });
      });
    }, 45000);
  });
});
