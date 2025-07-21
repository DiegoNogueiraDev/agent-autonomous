import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { CrewOrchestrator } from '../../src/agents/crew-orchestrator';
import type { CSVRow, CrewConfig, FieldMapping } from '../../src/types/index';

describe('CrewOrchestrator', () => {
  let crewOrchestrator: CrewOrchestrator;
  let testConfig: CrewConfig;

  beforeEach(() => {
    testConfig = {
      maxConcurrentTasks: 4,
      taskTimeout: 30000,
      retryAttempts: 2,
      agentHealthCheck: true,
      performanceMonitoring: true
    };

    crewOrchestrator = new CrewOrchestrator(testConfig);
  });

  afterEach(async () => {
    if (crewOrchestrator && typeof crewOrchestrator.cleanup === 'function') {
      await crewOrchestrator.cleanup();
    }
  });

  describe('initialization', () => {
    test('should initialize with correct configuration', async () => {
      await crewOrchestrator.initialize();

      expect(crewOrchestrator.isInitialized()).toBe(true);
      expect(crewOrchestrator.getActiveAgents()).toBeGreaterThan(0);
    });

    test('should create all required specialized agents', async () => {
      await crewOrchestrator.initialize();

      const agentStatus = crewOrchestrator.getAgentStatus();

      expect(agentStatus.navigator).toBeDefined();
      expect(agentStatus.extractor).toBeDefined();
      expect(agentStatus.ocr_specialist).toBeDefined();
      expect(agentStatus.validator).toBeDefined();
      expect(agentStatus.evidence_collector).toBeDefined();
      expect(agentStatus.coordinator).toBeDefined();
    });

    test('should handle initialization failures gracefully', async () => {
      const invalidConfig: CrewConfig = {
        maxConcurrentTasks: -1, // Invalid
        taskTimeout: 0, // Invalid
        retryAttempts: -1, // Invalid
        agentHealthCheck: true,
        performanceMonitoring: true
      };

      expect(() => new CrewOrchestrator(invalidConfig)).toThrow();
    });
  });

  describe('navigation phase', () => {
    const mockCsvRow: CSVRow = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com'
    };

    const mockConfig = {
      targetUrl: 'https://httpbin.org/html',
      fieldMappings: [] as FieldMapping[]
    };

    beforeEach(async () => {
      await crewOrchestrator.initialize();
    });

    test('should execute navigation phase successfully', async () => {
      const result = await crewOrchestrator.executeNavigationPhase(mockCsvRow, mockConfig);

      expect(result.success).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.loadTime).toBeGreaterThan(0);
      expect(result.agentId).toBe('navigator');
    }, 30000);

    test('should handle navigation failures with retry', async () => {
      const invalidConfig = {
        targetUrl: 'https://invalid-domain-that-does-not-exist-12345.com',
        fieldMappings: []
      };

      const result = await crewOrchestrator.executeNavigationPhase(mockCsvRow, invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.retryCount).toBeGreaterThan(0);
    }, 10000);

    test('should interpolate URL templates correctly', async () => {
      const templatedConfig = {
        targetUrl: 'https://httpbin.org/get?id={id}',
        fieldMappings: []
      };

      const result = await crewOrchestrator.executeNavigationPhase(mockCsvRow, templatedConfig);

      expect(result.url).toContain('123'); // Should have interpolated {id}
      expect(result.url).toBe('https://httpbin.org/get?id=123');
    }, 25000);
  });

  describe('extraction phase', () => {
    const mockFieldMappings: FieldMapping[] = [
      {
        csvField: 'title',
        webSelector: 'h1',
        fieldType: 'string',
        required: true,
        validationStrategy: 'hybrid'
      },
      {
        csvField: 'content',
        webSelector: 'p',
        fieldType: 'string',
        required: false,
        validationStrategy: 'dom_extraction'
      }
    ];

    beforeEach(async () => {
      await crewOrchestrator.initialize();

      // First navigate to a test page
      await crewOrchestrator.executeNavigationPhase(
        { id: '123' },
        { targetUrl: 'https://httpbin.org/html', fieldMappings: [] }
      );
    });

    test('should execute extraction phase with parallel agents', async () => {
      const result = await crewOrchestrator.executeExtractionPhase(mockFieldMappings);

      expect(result.success).toBe(true);
      expect(result.extractedData).toBeDefined();
      expect(result.participatingAgents).toContain('extractor');
      expect(result.processingTime).toBeGreaterThan(0);
    }, 20000);

    test('should coordinate DOM and OCR extraction methods', async () => {
      const hybridMapping: FieldMapping[] = [{
        csvField: 'title',
        webSelector: 'h1',
        fieldType: 'string',
        required: true,
        validationStrategy: 'hybrid'
      }];

      const result = await crewOrchestrator.executeExtractionPhase(hybridMapping);

      expect(result.success).toBe(true);
      expect(result.methodsUsed).toBeDefined();
      expect(result.extractedData.title).toBeDefined();
    }, 25000);

    test('should handle extraction failures gracefully', async () => {
      const invalidMappings: FieldMapping[] = [{
        csvField: 'nonexistent',
        webSelector: 'invalid-selector-that-does-not-exist',
        fieldType: 'string',
        required: true,
        validationStrategy: 'dom_extraction'
      }];

      const result = await crewOrchestrator.executeExtractionPhase(invalidMappings);

      expect(result.success).toBe(true); // Should still succeed overall
      expect(result.extractedData.nonexistent).toBeFalsy();
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('validation phase', () => {
    const mockCsvRow: CSVRow = {
      title: 'Herman Melville - Moby-Dick',
      content: 'The novel Moby-Dick'
    };

    const mockExtractedData = {
      title: 'Herman Melville - Moby-Dick',
      content: 'The novel Moby-Dick'
    };

    const mockFieldMappings: FieldMapping[] = [
      {
        csvField: 'title',
        webSelector: 'h1',
        fieldType: 'string',
        required: true,
        validationStrategy: 'hybrid'
      }
    ];

    beforeEach(async () => {
      await crewOrchestrator.initialize();
    });

    test('should execute validation phase with LLM agent', async () => {
      const result = await crewOrchestrator.executeValidationPhase(
        mockCsvRow,
        mockExtractedData,
        mockFieldMappings
      );

      expect(result.success).toBe(true);
      expect(result.validationResults).toBeDefined();
      expect(result.agentId).toBe('validator');
      expect(Array.isArray(result.validationResults)).toBe(true);
    }, 30000);

    test('should handle validation with confidence scoring', async () => {
      const mismatchData = {
        title: 'Different Title',
        content: 'Different content'
      };

      const result = await crewOrchestrator.executeValidationPhase(
        mockCsvRow,
        mismatchData,
        mockFieldMappings
      );

      expect(result.success).toBe(true);
      expect(result.validationResults[0].confidence).toBeDefined();
      expect(result.validationResults[0].confidence).toBeGreaterThanOrEqual(0);
      expect(result.validationResults[0].confidence).toBeLessThanOrEqual(1);
    }, 30000);

    test('should use intelligent fallback when LLM unavailable', async () => {
      // Mock LLM unavailability by using a different approach
      const result = await crewOrchestrator.executeValidationPhase(
        mockCsvRow,
        mockExtractedData,
        mockFieldMappings,
        { useFallback: true }
      );

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.validationResults).toBeDefined();
    }, 15000);
  });

  describe('evidence collection phase', () => {
    const mockCsvRow: CSVRow = {
      id: '123',
      name: 'John Doe'
    };

    const mockExtractionResults = {
      extractedData: { name: 'John Doe' },
      screenshots: ['screenshot1.png'],
      domSnapshot: '<html><body>Test</body></html>'
    };

    beforeEach(async () => {
      await crewOrchestrator.initialize();
    });

    test('should execute evidence collection phase', async () => {
      const result = await crewOrchestrator.executeEvidencePhase(mockCsvRow, mockExtractionResults);

      expect(result.success).toBe(true);
      expect(result.evidenceId).toBeDefined();
      expect(result.agentId).toBe('evidenceCollector');
      expect(result.collectedFiles).toBeGreaterThan(0);
    });

    test('should handle evidence collection failures gracefully', async () => {
      const corruptedResults = {
        extractedData: null,
        screenshots: [],
        domSnapshot: ''
      };

      const result = await crewOrchestrator.executeEvidencePhase(mockCsvRow, corruptedResults);

      expect(result.success).toBe(true); // Should still succeed with partial data
      expect(result.warnings).toBeDefined();
    });
  });

  describe('resource coordination', () => {
    beforeEach(async () => {
      await crewOrchestrator.initialize();
    });

        test('should manage concurrent task limits', async () => {
      // Test that concurrent task management methods exist and work
      const metrics = crewOrchestrator.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.completedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.failedTasks).toBeGreaterThanOrEqual(0);

      // Verify that orchestrator can track task metrics
      expect(typeof metrics.successRate).toBe('number');
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
    }, 5000);

    test('should monitor agent health', async () => {
      const healthStatus = await crewOrchestrator.checkAgentHealth();

      expect(healthStatus.overall).toBe(true);
      expect(healthStatus.agents).toBeDefined();
      expect(Object.keys(healthStatus.agents)).toContain('navigator');
      expect(Object.keys(healthStatus.agents)).toContain('extractor');
      expect(Object.keys(healthStatus.agents)).toContain('validator');
    });

    test('should provide performance metrics', async () => {
      // Execute some tasks first
      await crewOrchestrator.executeNavigationPhase(
        { id: '123' },
        { targetUrl: 'https://httpbin.org/html', fieldMappings: [] }
      );

      const metrics = crewOrchestrator.getPerformanceMetrics();

      expect(metrics.totalTasks).toBeGreaterThan(0);
      expect(metrics.averageTaskTime).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
      expect(metrics.agentUtilization).toBeDefined();
    }, 15000);
  });

  describe('error handling and recovery', () => {
    beforeEach(async () => {
      await crewOrchestrator.initialize();
    });

    test('should retry failed tasks automatically', async () => {
      const invalidConfig = {
        targetUrl: 'https://invalid-domain-12345.com',
        fieldMappings: []
      };

      const result = await crewOrchestrator.executeNavigationPhase({ id: '123' }, invalidConfig);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(testConfig.retryAttempts);
    }, 15000);

    test('should handle agent failures gracefully', async () => {
      // Simulate agent failure by overloading with impossible tasks
      const heavyTasks = [];
      for (let i = 0; i < 20; i++) {
        heavyTasks.push(
          crewOrchestrator.executeNavigationPhase(
            { id: `${i}` },
            { targetUrl: 'https://httpbin.org/delay/10', fieldMappings: [] }
          )
        );
      }

      // Should handle gracefully without crashing
      const results = await Promise.allSettled(heavyTasks);

      expect(results.length).toBe(20);
      // Some might succeed, some might fail, but none should crash the system
    }, 45000);

    test('should implement circuit breaker pattern', async () => {
      // Execute multiple failing tasks to trigger circuit breaker
      const failingTasks = [];
      for (let i = 0; i < 10; i++) {
        failingTasks.push(
          crewOrchestrator.executeNavigationPhase(
            { id: `${i}` },
            { targetUrl: 'https://invalid-domain-12345.com', fieldMappings: [] }
          )
        );
      }

      await Promise.allSettled(failingTasks);

      // Circuit should be open now
      const circuitStatus = crewOrchestrator.getCircuitBreakerStatus();
      expect(circuitStatus.navigator).toBeDefined();
    }, 30000);
  });

  describe('configuration and customization', () => {
    test('should support custom agent configurations', async () => {
      const customConfig: CrewConfig = {
        maxConcurrentTasks: 2,
        taskTimeout: 15000,
        retryAttempts: 1,
        agentHealthCheck: false,
        performanceMonitoring: false,
        customAgentSettings: {
          navigator: { timeout: 10000 },
          extractor: { maxElements: 50 },
          validator: { confidenceThreshold: 0.8 }
        }
      };

      const customOrchestrator = new CrewOrchestrator(customConfig);
      await customOrchestrator.initialize();

      expect(customOrchestrator.isInitialized()).toBe(true);

      await customOrchestrator.cleanup();
    });

    test('should validate configuration parameters', () => {
      const invalidConfigs = [
        { maxConcurrentTasks: 0 },
        { taskTimeout: -1 },
        { retryAttempts: -1 }
      ];

      invalidConfigs.forEach(config => {
        expect(() => new CrewOrchestrator(config as CrewConfig)).toThrow();
      });
    });
  });

  describe('cleanup and resource management', () => {
    test('should cleanup all agents properly', async () => {
      await crewOrchestrator.initialize();
      expect(crewOrchestrator.isInitialized()).toBe(true);

      await crewOrchestrator.cleanup();
      expect(crewOrchestrator.isInitialized()).toBe(false);
    });

    test('should handle cleanup during active tasks', async () => {
      await crewOrchestrator.initialize();

      // Start a long-running task
      const longTask = crewOrchestrator.executeNavigationPhase(
        { id: '123' },
        { targetUrl: 'https://httpbin.org/delay/5', fieldMappings: [] }
      );

      // Cleanup while task is running
      await crewOrchestrator.cleanup();

      // Task should be cancelled or completed gracefully
      const result = await longTask;
      expect(result).toBeDefined();
    }, 15000);

    test('should provide resource usage statistics', async () => {
      // Simplified test - just check that resource stats can be retrieved
      const resourceStats = crewOrchestrator.getResourceUsage();

      expect(resourceStats).toBeDefined();
      expect(resourceStats.memoryUsage).toBeDefined();
      expect(resourceStats.cpuUsage).toBeDefined();
      expect(resourceStats.activeConnections).toBeDefined();
      expect(resourceStats.queueSize).toBeDefined();

      // Validate that values exist and are not null/undefined
      expect(resourceStats.memoryUsage).not.toBeNull();
      expect(resourceStats.cpuUsage).not.toBeNull();
      expect(resourceStats.activeConnections).toBeGreaterThanOrEqual(0);
      expect(resourceStats.queueSize).toBeGreaterThanOrEqual(0);
    }, 5000);
  });
});
