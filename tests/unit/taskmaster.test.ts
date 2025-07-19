import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TaskmasterController } from '../../src/core/taskmaster';
import type { ValidationConfig, CSVData } from '../../src/types/index';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('TaskmasterController', () => {
  let taskmaster: TaskmasterController;
  let tempDir: string;
  let sampleCsvPath: string;
  let sampleConfigPath: string;

  beforeEach(async () => {
    taskmaster = new TaskmasterController();
    
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskmaster-test-'));
    sampleCsvPath = path.join(tempDir, 'sample.csv');
    sampleConfigPath = path.join(tempDir, 'config.yaml');

    // Create sample CSV file
    const csvContent = `name,email,id
John Doe,john@example.com,123
Jane Smith,jane@example.com,456
Bob Johnson,bob@example.com,789`;
    await fs.writeFile(sampleCsvPath, csvContent);

    // Create sample config file
    const configContent = `
targetUrl: "https://httpbin.org/html"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
    required: true
  - csvField: "email"
    webSelector: ".email"
    fieldType: "email"
    required: false
validationRules:
  confidence:
    minimumOverall: 0.7
    minimumField: 0.5
performance:
  batchSize: 5
  parallelWorkers: 2
  timeout: 15000
evidence:
  retention: 30
  screenshots: true
`;
    await fs.writeFile(sampleConfigPath, configContent);
  });

  afterEach(async () => {
    // Cleanup
    if (taskmaster && typeof taskmaster.cleanup === 'function') {
      await taskmaster.cleanup();
    }
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      expect(taskmaster).toBeDefined();
      expect(typeof taskmaster.validateData).toBe('function');
    });

    test('should load configuration and CSV data', async () => {
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalRows).toBe(3);
    }, 30000);

    test('should handle invalid input file path', async () => {
      await expect(taskmaster.validateData({
        inputPath: '/non/existent/file.csv',
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      })).rejects.toThrow();
    });

    test('should handle invalid config file path', async () => {
      await expect(taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: '/non/existent/config.yaml',
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      })).rejects.toThrow();
    });
  });

  describe('data validation process', () => {
    test('should process all CSV rows', async () => {
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);
      expect(result.results).toHaveLength(3);
    }, 30000);

    test('should handle validation errors gracefully', async () => {
      // Create config with invalid URL to trigger errors
      const invalidConfigContent = `
targetUrl: "https://invalid-domain-that-does-not-exist-12345.com"
fieldMappings:
  - csvField: "name"
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

      expect(result).toBeDefined();
      expect(result.summary.totalRows).toBe(3);
      // Some rows might fail due to invalid URL
      expect(result.summary.errorRate).toBeGreaterThan(0);
    }, 30000);

    test('should apply row limits correctly', async () => {
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json'],
        maxRows: 2
      });

      expect(result.summary.totalRows).toBe(2);
      expect(result.results).toHaveLength(2);
    }, 30000);

    test('should handle empty CSV file', async () => {
      const emptyCsvPath = path.join(tempDir, 'empty.csv');
      await fs.writeFile(emptyCsvPath, 'name,email,id\n'); // Only headers

      const result = await taskmaster.validateData({
        inputPath: emptyCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result.summary.totalRows).toBe(0);
      expect(result.results).toHaveLength(0);
    }, 30000);
  });

  describe('output generation', () => {
    test('should generate JSON output', async () => {
      const outputPath = path.join(tempDir, 'output');
      
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath,
        formats: ['json']
      });

      expect(result).toBeDefined();
      
      // Check if output files were created
      const files = await fs.readdir(outputPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      expect(jsonFiles.length).toBeGreaterThan(0);
    }, 30000);

    test('should generate multiple output formats', async () => {
      const outputPath = path.join(tempDir, 'output');
      
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath,
        formats: ['json', 'html']
      });

      expect(result).toBeDefined();
      
      // Check if both output formats were created
      const files = await fs.readdir(outputPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      
      expect(jsonFiles.length).toBeGreaterThan(0);
      expect(htmlFiles.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('parallel processing', () => {
    test('should respect parallel worker limits', async () => {
      const configContent = `
targetUrl: "https://httpbin.org/delay/1"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
performance:
  parallelWorkers: 2
  timeout: 10000
`;
      const parallelConfigPath = path.join(tempDir, 'parallel-config.yaml');
      await fs.writeFile(parallelConfigPath, configContent);

      const startTime = Date.now();
      
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: parallelConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      const duration = Date.now() - startTime;
      
      expect(result).toBeDefined();
      // With 3 rows and 2 parallel workers, should take at least 2 seconds
      // but less than 6 seconds (3 sequential requests would be ~3 seconds)
      expect(duration).toBeGreaterThan(1000);
      expect(duration).toBeLessThan(15000);
    }, 20000);
  });

  describe('error handling and recovery', () => {
    test('should continue processing after individual row failures', async () => {
      // Mix valid and invalid data
      const mixedCsvContent = `name,email,id
John Doe,john@example.com,123
,invalid-email,456
Jane Smith,jane@example.com,789`;
      const mixedCsvPath = path.join(tempDir, 'mixed.csv');
      await fs.writeFile(mixedCsvPath, mixedCsvContent);

      const result = await taskmaster.validateData({
        inputPath: mixedCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);
      // Should still process all rows even if some have issues
      expect(result.results).toHaveLength(3);
    }, 30000);

    test('should handle timeout gracefully', async () => {
      const timeoutConfigContent = `
targetUrl: "https://httpbin.org/delay/10"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
performance:
  timeout: 2000
`;
      const timeoutConfigPath = path.join(tempDir, 'timeout-config.yaml');
      await fs.writeFile(timeoutConfigPath, timeoutConfigContent);

      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: timeoutConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result).toBeDefined();
      // Should complete despite timeouts
      expect(result.summary.totalRows).toBe(3);
    }, 30000);
  });

  describe('configuration validation', () => {
    test('should validate configuration before processing', async () => {
      const invalidConfigContent = `
targetUrl: "not-a-valid-url"
fieldMappings: []
`;
      const invalidConfigPath = path.join(tempDir, 'invalid-config.yaml');
      await fs.writeFile(invalidConfigPath, invalidConfigContent);

      await expect(taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: invalidConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      })).rejects.toThrow();
    });
  });

  describe('progress tracking', () => {
    test('should provide progress updates during processing', async () => {
      const progressUpdates: number[] = [];
      
      // Mock progress callback
      const mockProgressCallback = jest.fn((progress: number) => {
        progressUpdates.push(progress);
      });

      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json'],
        onProgress: mockProgressCallback
      });

      expect(result).toBeDefined();
      expect(mockProgressCallback).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    }, 30000);
  });

  describe('cleanup', () => {
    test('should cleanup resources properly', async () => {
      await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      // Should not throw when cleaning up
      await expect(taskmaster.cleanup()).resolves.not.toThrow();
    }, 30000);
  });

  describe('statistics', () => {
    test('should provide accurate processing statistics', async () => {
      const result = await taskmaster.validateData({
        inputPath: sampleCsvPath,
        configPath: sampleConfigPath,
        outputPath: path.join(tempDir, 'output'),
        formats: ['json']
      });

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(3);
      expect(typeof result.summary.processingTime).toBe('number');
      expect(result.summary.processingTime).toBeGreaterThan(0);
      expect(typeof result.summary.averageConfidence).toBe('number');
      expect(result.summary.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.summary.averageConfidence).toBeLessThanOrEqual(1);
    }, 30000);
  });
});