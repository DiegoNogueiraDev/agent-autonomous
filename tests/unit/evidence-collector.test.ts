import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EvidenceCollector } from '../../src/evidence/evidence-collector';
import type { EvidenceSettings, ValidationResult } from '../../src/types/index';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('EvidenceCollector', () => {
  let evidenceCollector: EvidenceCollector;
  let tempDir: string;
  let evidenceDir: string;
  let testSettings: EvidenceSettings;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evidence-test-'));
    evidenceDir = path.join(tempDir, 'evidence');

    testSettings = {
      retention: 30,
      screenshots: true,
      domSnapshots: true,
      compressionAfter: 7,
      evidenceDir: evidenceDir
    };

    evidenceCollector = new EvidenceCollector({ settings: testSettings });
  });

  afterEach(async () => {
    if (evidenceCollector && typeof evidenceCollector.cleanup === 'function') {
      await evidenceCollector.cleanup();
    }
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    test('should initialize with correct settings', async () => {
      await evidenceCollector.initialize();
      
      expect(evidenceCollector.isInitialized()).toBe(true);
      
      // Check if evidence directory was created
      const stats = await fs.stat(evidenceDir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should create required subdirectories', async () => {
      await evidenceCollector.initialize();
      
      const expectedDirs = ['screenshots', 'dom-snapshots', 'data', 'logs'];
      
      for (const dir of expectedDirs) {
        const dirPath = path.join(evidenceDir, dir);
        const stats = await fs.stat(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    test('should handle existing evidence directory', async () => {
      // Create directory first
      await fs.mkdir(evidenceDir, { recursive: true });
      
      // Should not throw when initializing with existing directory
      await expect(evidenceCollector.initialize()).resolves.not.toThrow();
    });
  });

  describe('evidence collection', () => {
    beforeEach(async () => {
      await evidenceCollector.initialize();
    });

    test('should collect validation evidence', async () => {
      const mockValidationResult: ValidationResult = {
        rowIndex: 0,
        csvData: { name: 'John Doe', email: 'john@example.com', id: '123' },
        webData: { name: 'John Doe', email: 'john@example.com' },
        validations: [{
          field: 'name',
          match: true,
          confidence: 0.95,
          method: 'dom_extraction',
          reasoning: 'Exact match found'
        }],
        processingTime: 1500,
        timestamp: new Date().toISOString()
      };

      const mockScreenshots = [
        { filename: 'full-page.png', buffer: Buffer.from('fake-png-data') },
        { filename: 'field-name.png', buffer: Buffer.from('fake-element-png') }
      ];

      const mockDomSnapshot = '<html><body><h1>Test Page</h1></body></html>';

      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult: mockValidationResult,
        screenshots: mockScreenshots,
        domSnapshot: mockDomSnapshot,
        metadata: {
          url: 'https://example.com',
          userAgent: 'Test Agent',
          viewport: { width: 1280, height: 720 }
        }
      });

      expect(evidenceId).toBeDefined();
      expect(typeof evidenceId).toBe('string');
      expect(evidenceId.length).toBeGreaterThan(0);
    });

    test('should save screenshots to correct location', async () => {
      const screenshots = [
        { filename: 'test-screenshot.png', buffer: Buffer.from('fake-png-data') }
      ];

      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult: {
          rowIndex: 0,
          csvData: {},
          webData: {},
          validations: [],
          processingTime: 100,
          timestamp: new Date().toISOString()
        },
        screenshots
      });

      const screenshotsDir = path.join(evidenceDir, 'screenshots');
      const files = await fs.readdir(screenshotsDir);
      const screenshotFiles = files.filter(f => f.includes(evidenceId) && f.endsWith('.png'));
      
      expect(screenshotFiles.length).toBeGreaterThan(0);
    });

    test('should save DOM snapshot to correct location', async () => {
      const domSnapshot = '<html><body><h1>Test Content</h1></body></html>';

      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult: {
          rowIndex: 0,
          csvData: {},
          webData: {},
          validations: [],
          processingTime: 100,
          timestamp: new Date().toISOString()
        },
        domSnapshot
      });

      const domDir = path.join(evidenceDir, 'dom-snapshots');
      const files = await fs.readdir(domDir);
      const domFiles = files.filter(f => f.includes(evidenceId) && f.endsWith('.html'));
      
      expect(domFiles.length).toBe(1);
      
      const savedContent = await fs.readFile(path.join(domDir, domFiles[0]), 'utf-8');
      expect(savedContent).toBe(domSnapshot);
    });

    test('should save validation data as JSON', async () => {
      const validationResult = {
        rowIndex: 0,
        csvData: { name: 'John Doe' },
        webData: { name: 'John Doe' },
        validations: [{
          field: 'name',
          match: true,
          confidence: 0.95,
          method: 'dom_extraction' as const,
          reasoning: 'Exact match'
        }],
        processingTime: 100,
        timestamp: new Date().toISOString()
      };

      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult
      });

      const dataDir = path.join(evidenceDir, 'data');
      const files = await fs.readdir(dataDir);
      const dataFiles = files.filter(f => f.includes(evidenceId) && f.endsWith('.json'));
      
      expect(dataFiles.length).toBe(1);
      
      const savedData = JSON.parse(await fs.readFile(path.join(dataDir, dataFiles[0]), 'utf-8'));
      expect(savedData.rowIndex).toBe(validationResult.rowIndex);
      expect(savedData.csvData).toEqual(validationResult.csvData);
    });

    test('should handle missing optional evidence types', async () => {
      const validationResult = {
        rowIndex: 0,
        csvData: {},
        webData: {},
        validations: [],
        processingTime: 100,
        timestamp: new Date().toISOString()
      };

      // Should not throw when screenshots and DOM snapshot are missing
      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult
      });

      expect(evidenceId).toBeDefined();
    });
  });

  describe('evidence indexing', () => {
    beforeEach(async () => {
      await evidenceCollector.initialize();
    });

    test('should create and update evidence index', async () => {
      const validationResult = {
        rowIndex: 0,
        csvData: { name: 'John Doe' },
        webData: { name: 'John Doe' },
        validations: [],
        processingTime: 100,
        timestamp: new Date().toISOString()
      };

      await evidenceCollector.collectValidationEvidence({ validationResult });

      const indexPath = path.join(evidenceDir, 'evidence_index.json');
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
      
      expect(indexExists).toBe(true);
      
      const indexContent = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
      expect(Array.isArray(indexContent.entries)).toBe(true);
      expect(indexContent.entries.length).toBe(1);
    });

    test('should search evidence by criteria', async () => {
      // Collect multiple evidence entries
      for (let i = 0; i < 3; i++) {
        await evidenceCollector.collectValidationEvidence({
          validationResult: {
            rowIndex: i,
            csvData: { name: `User ${i}` },
            webData: { name: `User ${i}` },
            validations: [],
            processingTime: 100,
            timestamp: new Date().toISOString()
          }
        });
      }

      const searchResults = await evidenceCollector.searchEvidence({
        rowIndex: 1
      });

      expect(searchResults.length).toBe(1);
      expect(searchResults[0].rowIndex).toBe(1);
    });

    test('should search evidence by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await evidenceCollector.collectValidationEvidence({
        validationResult: {
          rowIndex: 0,
          csvData: { name: 'User' },
          webData: { name: 'User' },
          validations: [],
          processingTime: 100,
          timestamp: now.toISOString()
        }
      });

      const searchResults = await evidenceCollector.searchEvidence({
        dateRange: {
          start: yesterday.toISOString(),
          end: tomorrow.toISOString()
        }
      });

      expect(searchResults.length).toBe(1);
    });
  });

  describe('evidence cleanup and retention', () => {
    beforeEach(async () => {
      await evidenceCollector.initialize();
    });

    test('should clean up old evidence based on retention policy', async () => {
      // Create evidence with old timestamp
      const oldTimestamp = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(); // 35 days ago

      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult: {
          rowIndex: 0,
          csvData: {},
          webData: {},
          validations: [],
          processingTime: 100,
          timestamp: oldTimestamp
        }
      });

      // Run cleanup
      const cleanupResult = await evidenceCollector.cleanupOldEvidence();

      expect(cleanupResult.removedEntries).toBeGreaterThan(0);
      expect(cleanupResult.freedSpace).toBeGreaterThan(0);
    });

    test('should compress old evidence after specified days', async () => {
      // Create evidence that should be compressed (older than compressionAfter days)
      const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago

      await evidenceCollector.collectValidationEvidence({
        validationResult: {
          rowIndex: 0,
          csvData: {},
          webData: {},
          validations: [],
          processingTime: 100,
          timestamp: oldTimestamp
        },
        screenshots: [
          { filename: 'test.png', buffer: Buffer.from('test-data'.repeat(1000)) }
        ]
      });

      const compressionResult = await evidenceCollector.compressOldEvidence();

      expect(compressionResult.compressedFiles).toBeGreaterThanOrEqual(0);
      expect(compressionResult.spaceSaved).toBeGreaterThanOrEqual(0);
    });

    test('should provide storage statistics', async () => {
      await evidenceCollector.collectValidationEvidence({
        validationResult: {
          rowIndex: 0,
          csvData: {},
          webData: {},
          validations: [],
          processingTime: 100,
          timestamp: new Date().toISOString()
        },
        screenshots: [
          { filename: 'test.png', buffer: Buffer.from('test-data') }
        ]
      });

      const stats = await evidenceCollector.getStorageStats();

      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.byType.screenshots).toBeGreaterThan(0);
      expect(stats.byType.data).toBeGreaterThan(0);
    });
  });

  describe('evidence retrieval', () => {
    beforeEach(async () => {
      await evidenceCollector.initialize();
    });

    test('should retrieve evidence by ID', async () => {
      const validationResult = {
        rowIndex: 0,
        csvData: { name: 'John Doe' },
        webData: { name: 'John Doe' },
        validations: [],
        processingTime: 100,
        timestamp: new Date().toISOString()
      };

      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult,
        screenshots: [
          { filename: 'test.png', buffer: Buffer.from('test-data') }
        ]
      });

      const retrievedEvidence = await evidenceCollector.getEvidenceById(evidenceId);

      expect(retrievedEvidence).toBeDefined();
      expect(retrievedEvidence?.id).toBe(evidenceId);
      expect(retrievedEvidence?.data.rowIndex).toBe(0);
      expect(retrievedEvidence?.files.screenshots.length).toBe(1);
    });

    test('should return null for non-existent evidence ID', async () => {
      const retrievedEvidence = await evidenceCollector.getEvidenceById('non-existent-id');
      expect(retrievedEvidence).toBe(null);
    });

    test('should get evidence summary', async () => {
      // Collect multiple evidence entries
      for (let i = 0; i < 5; i++) {
        await evidenceCollector.collectValidationEvidence({
          validationResult: {
            rowIndex: i,
            csvData: { name: `User ${i}` },
            webData: { name: `User ${i}` },
            validations: [],
            processingTime: 100 + i * 10,
            timestamp: new Date().toISOString()
          }
        });
      }

      const summary = await evidenceCollector.getEvidenceSummary();

      expect(summary.totalEntries).toBe(5);
      expect(summary.dateRange.start).toBeDefined();
      expect(summary.dateRange.end).toBeDefined();
      expect(summary.processingTimeStats.average).toBeGreaterThan(0);
      expect(summary.processingTimeStats.min).toBe(100);
      expect(summary.processingTimeStats.max).toBe(140);
    });
  });

  describe('error handling', () => {
    test('should handle initialization errors gracefully', async () => {
      // Try to initialize with invalid directory path
      const invalidSettings = {
        ...testSettings,
        evidenceDir: '/invalid/path/that/cannot/be/created'
      };

      const invalidCollector = new EvidenceCollector({ settings: invalidSettings });

      await expect(invalidCollector.initialize()).rejects.toThrow();
    });

    test('should handle file write errors', async () => {
      await evidenceCollector.initialize();

      // Create a validation result that might cause issues
      const problematicResult = {
        rowIndex: 0,
        csvData: { name: '\0\0\0' }, // Null characters might cause issues
        webData: {},
        validations: [],
        processingTime: 100,
        timestamp: new Date().toISOString()
      };

      // Should handle gracefully and still return an evidence ID
      const evidenceId = await evidenceCollector.collectValidationEvidence({
        validationResult: problematicResult
      });

      expect(evidenceId).toBeDefined();
    });

    test('should handle corrupted index file', async () => {
      await evidenceCollector.initialize();

      // Corrupt the index file
      const indexPath = path.join(evidenceDir, 'evidence_index.json');
      await fs.writeFile(indexPath, 'invalid-json{');

      // Should rebuild index when trying to search
      const searchResults = await evidenceCollector.searchEvidence({});
      expect(Array.isArray(searchResults)).toBe(true);
    });
  });

  describe('settings and configuration', () => {
    test('should respect evidence retention settings', () => {
      const customSettings = {
        retention: 14,
        screenshots: false,
        domSnapshots: true,
        compressionAfter: 3,
        evidenceDir: evidenceDir
      };

      const customCollector = new EvidenceCollector({ settings: customSettings });
      const settings = customCollector.getSettings();

      expect(settings.retention).toBe(14);
      expect(settings.screenshots).toBe(false);
      expect(settings.domSnapshots).toBe(true);
      expect(settings.compressionAfter).toBe(3);
    });

    test('should validate settings on creation', () => {
      const invalidSettings = {
        retention: -1, // Invalid negative retention
        screenshots: true,
        domSnapshots: true,
        compressionAfter: 7,
        evidenceDir: evidenceDir
      };

      expect(() => new EvidenceCollector({ settings: invalidSettings }))
        .toThrow();
    });
  });
});