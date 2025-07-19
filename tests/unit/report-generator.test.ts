import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ReportGenerator } from '../../src/reporting/report-generator';
import type { ValidationResult, ReportConfig, ValidationSummary } from '../../src/types/index';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ReportGenerator', () => {
  let reportGenerator: ReportGenerator;
  let tempDir: string;
  let outputDir: string;
  let sampleResults: ValidationResult[];
  let sampleSummary: ValidationSummary;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-test-'));
    outputDir = path.join(tempDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const config: ReportConfig = {
      outputDir: outputDir,
      formats: ['json', 'html'],
      includeDetails: true,
      includeEvidence: true,
      template: 'default'
    };

    reportGenerator = new ReportGenerator({ config });

    // Create sample validation results
    sampleResults = [
      {
        rowIndex: 0,
        csvData: { name: 'John Doe', email: 'john@example.com', id: '123' },
        webData: { name: 'John Doe', email: 'john@example.com' },
        validations: [
          {
            field: 'name',
            match: true,
            confidence: 0.95,
            method: 'dom_extraction',
            reasoning: 'Exact match found'
          },
          {
            field: 'email',
            match: true,
            confidence: 0.90,
            method: 'dom_extraction',
            reasoning: 'Exact match found'
          }
        ],
        processingTime: 1500,
        timestamp: '2025-07-19T12:00:00.000Z'
      },
      {
        rowIndex: 1,
        csvData: { name: 'Jane Smith', email: 'jane@example.com', id: '456' },
        webData: { name: 'Smith, Jane', email: 'jane@example.com' },
        validations: [
          {
            field: 'name',
            match: true,
            confidence: 0.85,
            method: 'llm_validation',
            reasoning: 'Semantic equivalence detected (name order difference)'
          },
          {
            field: 'email',
            match: true,
            confidence: 0.95,
            method: 'dom_extraction',
            reasoning: 'Exact match found'
          }
        ],
        processingTime: 2100,
        timestamp: '2025-07-19T12:01:00.000Z'
      },
      {
        rowIndex: 2,
        csvData: { name: 'Bob Johnson', email: 'bob@example.com', id: '789' },
        webData: { name: 'Robert Johnson', email: 'bob.johnson@company.com' },
        validations: [
          {
            field: 'name',
            match: true,
            confidence: 0.75,
            method: 'llm_validation',
            reasoning: 'Likely nickname match (Bob vs Robert)'
          },
          {
            field: 'email',
            match: false,
            confidence: 0.20,
            method: 'dom_extraction',
            reasoning: 'Different email domains'
          }
        ],
        processingTime: 1800,
        timestamp: '2025-07-19T12:02:00.000Z'
      }
    ];

    sampleSummary = {
      totalRows: 3,
      processedRows: 3,
      successfulValidations: 2,
      averageConfidence: 0.77,
      processingTime: 5400,
      errorRate: 0.33,
      performance: {
        rowsPerSecond: 0.56,
        averageRowTime: 1800
      },
      validationBreakdown: {
        exact_matches: 4,
        fuzzy_matches: 2,
        no_matches: 1,
        errors: 0
      }
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(reportGenerator).toBeDefined();
      expect(typeof reportGenerator.generateReport).toBe('function');
    });

    test('should validate configuration on creation', () => {
      const invalidConfig = {
        outputDir: '', // Invalid empty path
        formats: [] as any[], // Empty formats array
        includeDetails: true,
        includeEvidence: true
      };

      expect(() => new ReportGenerator({ config: invalidConfig }))
        .toThrow();
    });
  });

  describe('JSON report generation', () => {
    test('should generate valid JSON report', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary,
        metadata: {
          configFile: 'test-config.yaml',
          inputFile: 'test-input.csv',
          timestamp: '2025-07-19T12:00:00.000Z'
        }
      });

      expect(reportPaths.json).toBeDefined();
      expect(typeof reportPaths.json).toBe('string');

      // Verify file exists and is valid JSON
      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);

      expect(reportData.summary).toBeDefined();
      expect(reportData.results).toBeDefined();
      expect(reportData.metadata).toBeDefined();
      expect(reportData.summary.totalRows).toBe(3);
      expect(reportData.results).toHaveLength(3);
    });

    test('should include all validation details in JSON', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);

      // Check first result has all details
      const firstResult = reportData.results[0];
      expect(firstResult.csvData).toEqual(sampleResults[0].csvData);
      expect(firstResult.webData).toEqual(sampleResults[0].webData);
      expect(firstResult.validations).toHaveLength(2);
      expect(firstResult.validations[0].confidence).toBe(0.95);
    });

    test('should handle empty results gracefully', async () => {
      const emptyResults: ValidationResult[] = [];
      const emptySummary: ValidationSummary = {
        totalRows: 0,
        processedRows: 0,
        successfulValidations: 0,
        averageConfidence: 0,
        processingTime: 0,
        errorRate: 0,
        performance: {
          rowsPerSecond: 0,
          averageRowTime: 0
        },
        validationBreakdown: {
          exact_matches: 0,
          fuzzy_matches: 0,
          no_matches: 0,
          errors: 0
        }
      };

      const reportPaths = await reportGenerator.generateReport({
        results: emptyResults,
        summary: emptySummary
      });

      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);

      expect(reportData.summary.totalRows).toBe(0);
      expect(reportData.results).toHaveLength(0);
    });
  });

  describe('HTML report generation', () => {
    test('should generate HTML report with proper structure', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      expect(reportPaths.html).toBeDefined();

      const htmlContent = await fs.readFile(reportPaths.html!, 'utf-8');
      
      // Check basic HTML structure
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('<html');
      expect(htmlContent).toContain('<head>');
      expect(htmlContent).toContain('<body>');
      expect(htmlContent).toContain('</html>');

      // Check for key content
      expect(htmlContent).toContain('DataHawk Validation Report');
      expect(htmlContent).toContain('John Doe');
      expect(htmlContent).toContain('Jane Smith');
      expect(htmlContent).toContain('Bob Johnson');
    });

    test('should include interactive elements in HTML', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      const htmlContent = await fs.readFile(reportPaths.html!, 'utf-8');

      // Check for interactive features
      expect(htmlContent).toContain('<script'); // JavaScript
      expect(htmlContent).toContain('chart'); // Charts
      expect(htmlContent).toContain('table'); // Data tables
      expect(htmlContent).toContain('filter'); // Filtering capabilities
    });

    test('should handle large datasets efficiently', async () => {
      // Generate a larger dataset
      const largeResults: ValidationResult[] = [];
      for (let i = 0; i < 100; i++) {
        largeResults.push({
          rowIndex: i,
          csvData: { name: `User ${i}`, email: `user${i}@example.com`, id: `${i}` },
          webData: { name: `User ${i}`, email: `user${i}@example.com` },
          validations: [{
            field: 'name',
            match: true,
            confidence: 0.9,
            method: 'dom_extraction',
            reasoning: 'Exact match'
          }],
          processingTime: 1000,
          timestamp: new Date().toISOString()
        });
      }

      const largeSummary = {
        ...sampleSummary,
        totalRows: 100,
        processedRows: 100
      };

      const startTime = Date.now();
      const reportPaths = await reportGenerator.generateReport({
        results: largeResults,
        summary: largeSummary
      });
      const generationTime = Date.now() - startTime;

      expect(reportPaths.html).toBeDefined();
      expect(generationTime).toBeLessThan(10000); // Should complete within 10 seconds

      const htmlContent = await fs.readFile(reportPaths.html!, 'utf-8');
      expect(htmlContent.length).toBeGreaterThan(10000); // Should generate substantial content
    });
  });

  describe('markdown report generation', () => {
    beforeEach(() => {
      const config: ReportConfig = {
        outputDir: outputDir,
        formats: ['markdown'],
        includeDetails: true,
        includeEvidence: true
      };
      reportGenerator = new ReportGenerator({ config });
    });

    test('should generate markdown report with proper formatting', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      expect(reportPaths.markdown).toBeDefined();

      const markdownContent = await fs.readFile(reportPaths.markdown!, 'utf-8');

      // Check markdown formatting
      expect(markdownContent).toContain('# DataHawk Validation Report');
      expect(markdownContent).toContain('## Summary');
      expect(markdownContent).toContain('## Detailed Results');
      expect(markdownContent).toContain('| Field | CSV Value | Web Value |'); // Tables
      expect(markdownContent).toContain('**Total Rows:**'); // Bold text
      expect(markdownContent).toContain('- '); // Lists
    });

    test('should include statistics in markdown format', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      const markdownContent = await fs.readFile(reportPaths.markdown!, 'utf-8');

      expect(markdownContent).toContain('Total Rows: 3');
      expect(markdownContent).toContain('Average Confidence: 77%');
      expect(markdownContent).toContain('Error Rate: 33%');
    });
  });

  describe('CSV report generation', () => {
    beforeEach(() => {
      const config: ReportConfig = {
        outputDir: outputDir,
        formats: ['csv'],
        includeDetails: true,
        includeEvidence: false
      };
      reportGenerator = new ReportGenerator({ config });
    });

    test('should generate CSV report with proper structure', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      expect(reportPaths.csv).toBeDefined();

      const csvContent = await fs.readFile(reportPaths.csv!, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());

      // Should have header + data rows
      expect(lines.length).toBeGreaterThan(3);
      
      // Check headers
      const headers = lines[0].split(',');
      expect(headers).toContain('"Row Index"');
      expect(headers).toContain('"Processing Time"');
      expect(headers).toContain('"Overall Match"');
    });

    test('should handle CSV escaping properly', async () => {
      const resultsWithCommas: ValidationResult[] = [{
        rowIndex: 0,
        csvData: { name: 'Smith, John', description: 'Senior Engineer, Team Lead' },
        webData: { name: 'John Smith', description: 'Senior Engineer, Team Lead' },
        validations: [{
          field: 'name',
          match: true,
          confidence: 0.9,
          method: 'dom_extraction',
          reasoning: 'Match found, order different'
        }],
        processingTime: 1000,
        timestamp: new Date().toISOString()
      }];

      const reportPaths = await reportGenerator.generateReport({
        results: resultsWithCommas,
        summary: sampleSummary
      });

      const csvContent = await fs.readFile(reportPaths.csv!, 'utf-8');
      
      // Should properly escape commas in quoted fields
      expect(csvContent).toContain('"Smith, John"');
      expect(csvContent).toContain('"Senior Engineer, Team Lead"');
    });
  });

  describe('multiple format generation', () => {
    test('should generate multiple formats simultaneously', async () => {
      const config: ReportConfig = {
        outputDir: outputDir,
        formats: ['json', 'html', 'markdown', 'csv'],
        includeDetails: true,
        includeEvidence: true
      };
      reportGenerator = new ReportGenerator({ config });

      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      expect(reportPaths.json).toBeDefined();
      expect(reportPaths.html).toBeDefined();
      expect(reportPaths.markdown).toBeDefined();
      expect(reportPaths.csv).toBeDefined();

      // Verify all files exist
      for (const path of Object.values(reportPaths)) {
        if (path) {
          const stats = await fs.stat(path);
          expect(stats.isFile()).toBe(true);
          expect(stats.size).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('evidence integration', () => {
    test('should include evidence references in reports', async () => {
      const resultsWithEvidence = sampleResults.map(result => ({
        ...result,
        evidence: {
          screenshots: [`screenshot_${result.rowIndex}.png`],
          domSnapshot: `dom_${result.rowIndex}.html`,
          id: `evidence_${result.rowIndex}`
        }
      }));

      const reportPaths = await reportGenerator.generateReport({
        results: resultsWithEvidence,
        summary: sampleSummary,
        evidencePath: '/path/to/evidence'
      });

      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);

      expect(reportData.results[0].evidence).toBeDefined();
      expect(reportData.results[0].evidence.screenshots).toContain('screenshot_0.png');
    });

    test('should generate evidence summary', async () => {
      const reportPaths = await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary,
        evidencePath: '/path/to/evidence'
      });

      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);

      expect(reportData.evidence).toBeDefined();
      expect(reportData.evidence.totalFiles).toBeDefined();
      expect(reportData.evidence.indexPath).toBeDefined();
    });
  });

  describe('performance and optimization', () => {
    test('should complete report generation within reasonable time', async () => {
      const startTime = Date.now();
      
      await reportGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      const generationTime = Date.now() - startTime;
      expect(generationTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle memory efficiently with large datasets', async () => {
      const largeResults: ValidationResult[] = [];
      for (let i = 0; i < 1000; i++) {
        largeResults.push({
          rowIndex: i,
          csvData: { name: `User ${i}`.repeat(10) }, // Larger data
          webData: { name: `User ${i}`.repeat(10) },
          validations: [{
            field: 'name',
            match: true,
            confidence: 0.9,
            method: 'dom_extraction',
            reasoning: 'Exact match found in web interface'
          }],
          processingTime: 1000,
          timestamp: new Date().toISOString()
        });
      }

      const largeSummary = {
        ...sampleSummary,
        totalRows: 1000,
        processedRows: 1000
      };

      // Should not throw memory errors
      await expect(reportGenerator.generateReport({
        results: largeResults,
        summary: largeSummary
      })).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    test('should handle invalid output directory', async () => {
      const invalidConfig: ReportConfig = {
        outputDir: '/invalid/path/that/does/not/exist',
        formats: ['json'],
        includeDetails: true,
        includeEvidence: false
      };

      const invalidGenerator = new ReportGenerator({ config: invalidConfig });

      await expect(invalidGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      })).rejects.toThrow();
    });

    test('should handle corrupted data gracefully', async () => {
      const corruptedResults = [
        {
          ...sampleResults[0],
          csvData: null as any,
          validations: undefined as any
        }
      ];

      // Should still generate report, handling null/undefined data
      const reportPaths = await reportGenerator.generateReport({
        results: corruptedResults,
        summary: sampleSummary
      });

      expect(reportPaths.json).toBeDefined();
      
      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);
      
      expect(reportData.results).toHaveLength(1);
    });

    test('should handle file write permissions errors', async () => {
      // Create output directory with no write permissions (if possible)
      const restrictedDir = path.join(tempDir, 'restricted');
      await fs.mkdir(restrictedDir, { mode: 0o444 }); // Read-only

      const restrictedConfig: ReportConfig = {
        outputDir: restrictedDir,
        formats: ['json'],
        includeDetails: true,
        includeEvidence: false
      };

      const restrictedGenerator = new ReportGenerator({ config: restrictedConfig });

      try {
        await expect(restrictedGenerator.generateReport({
          results: sampleResults,
          summary: sampleSummary
        })).rejects.toThrow();
      } finally {
        // Cleanup - restore permissions
        await fs.chmod(restrictedDir, 0o755);
      }
    });
  });

  describe('customization', () => {
    test('should support custom templates', async () => {
      const customConfig: ReportConfig = {
        outputDir: outputDir,
        formats: ['html'],
        includeDetails: true,
        includeEvidence: true,
        template: 'custom',
        customTemplateData: {
          companyName: 'Test Company',
          reportTitle: 'Custom Validation Report'
        }
      };

      const customGenerator = new ReportGenerator({ config: customConfig });

      const reportPaths = await customGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      const htmlContent = await fs.readFile(reportPaths.html!, 'utf-8');
      expect(htmlContent).toContain('Test Company');
      expect(htmlContent).toContain('Custom Validation Report');
    });

    test('should filter results based on configuration', async () => {
      const filterConfig: ReportConfig = {
        outputDir: outputDir,
        formats: ['json'],
        includeDetails: false, // Should exclude detailed validations
        includeEvidence: false
      };

      const filterGenerator = new ReportGenerator({ config: filterConfig });

      const reportPaths = await filterGenerator.generateReport({
        results: sampleResults,
        summary: sampleSummary
      });

      const jsonContent = await fs.readFile(reportPaths.json!, 'utf-8');
      const reportData = JSON.parse(jsonContent);

      // Should have summary but limited details
      expect(reportData.summary).toBeDefined();
      expect(reportData.results).toBeDefined();
      // Detailed validations might be excluded or simplified
    });
  });
});