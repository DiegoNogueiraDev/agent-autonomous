import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LocalLLMEngine } from '../../src/llm/local-llm-engine';
import type { LLMSettings, ValidationDecisionRequest } from '../../src/types/index';

describe('LocalLLMEngine - Real Implementation', () => {
  let llmEngine: LocalLLMEngine;
  let mockSettings: LLMSettings;

  beforeEach(() => {
    mockSettings = {
      modelPath: './models/llama3-8b-instruct.Q4_K_M.gguf',
      fallbackModelPath: './models/phi-3-mini-4k-instruct.Q4_K_M.gguf',
      contextSize: 8192,
      threads: 4,
      batchSize: 512,
      gpuLayers: 0,
      temperature: 0.1,
      maxTokens: 1024
    };

    llmEngine = new LocalLLMEngine({
      settings: mockSettings,
      enableFallback: true
    });
  });

  afterEach(async () => {
    // Cleanup any resources
    if (llmEngine && typeof (llmEngine as any).cleanup === 'function') {
      await (llmEngine as any).cleanup();
    }
  });

  describe('initialization', () => {
    test('should initialize with correct settings', async () => {
      expect(llmEngine).toBeDefined();
      expect(llmEngine.isInitialized()).toBe(false);
    });

    test('should initialize successfully with valid model path', async () => {
      // Skip if model file doesn't exist (CI/CD)
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) {
        console.log('⚠️  Model file not found, skipping real LLM test');
        return;
      }

      await expect(llmEngine.initialize()).resolves.not.toThrow();
      expect(llmEngine.isInitialized()).toBe(true);
    }, 30000); // Allow 30s for model loading

    test('should handle invalid model path gracefully', async () => {
      const invalidSettings = {
        ...mockSettings,
        modelPath: './models/non-existent-model.gguf'
      };

      const invalidEngine = new LocalLLMEngine({
        settings: invalidSettings,
        enableFallback: false
      });

      await expect(invalidEngine.initialize()).rejects.toThrow();
    });

    test('should fallback to lightweight model when primary fails', async () => {
      const settingsWithFallback = {
        ...mockSettings,
        modelPath: './models/non-existent-model.gguf',
        fallbackModelPath: './models/phi-3-mini-4k-instruct.Q4_K_M.gguf'
      };

      const fallbackEngine = new LocalLLMEngine({
        settings: settingsWithFallback,
        enableFallback: true
      });

      // Should not throw, should use fallback
      await expect(fallbackEngine.initialize()).resolves.not.toThrow();
    });
  });

  describe('validation decisions', () => {
    const sampleRequest: ValidationDecisionRequest = {
      csvValue: 'John Doe',
      webValue: 'John Doe',
      fieldType: 'string',
      fieldName: 'customer_name',
      context: {
        otherFields: { id: '123', email: 'john@example.com' }
      }
    };

    test('should throw error if not initialized', async () => {
      await expect(
        llmEngine.makeValidationDecision(sampleRequest)
      ).rejects.toThrow('LLM Engine not initialized');
    });

    test('should make validation decision for exact match', async () => {
      // Skip if model not available
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const result = await llmEngine.makeValidationDecision(sampleRequest);

      expect(result).toMatchObject({
        match: expect.any(Boolean),
        confidence: expect.any(Number),
        reasoning: expect.any(String),
        normalizedCsvValue: expect.anything(),
        normalizedWebValue: expect.anything()
      });

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, 15000);

    test('should detect mismatch for different values', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const mismatchRequest = {
        ...sampleRequest,
        csvValue: 'John Doe',
        webValue: 'Jane Smith'
      };

      const result = await llmEngine.makeValidationDecision(mismatchRequest);

      expect(result.match).toBe(false);
      expect(result.reasoning).toContain('different');
    }, 15000);

    test('should handle fuzzy matching for similar values', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const fuzzyRequest = {
        ...sampleRequest,
        csvValue: 'John Doe',
        webValue: 'john doe' // case difference
      };

      const result = await llmEngine.makeValidationDecision(fuzzyRequest);

      expect(result.match).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    }, 15000);

    test('should handle numeric comparisons', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const numericRequest = {
        ...sampleRequest,
        csvValue: '123.45',
        webValue: '$123.45',
        fieldType: 'currency',
        fieldName: 'price'
      };

      const result = await llmEngine.makeValidationDecision(numericRequest);

      expect(result.match).toBe(true);
      expect(result.reasoning).toContain('currency');
    }, 15000);

    test('should handle date comparisons', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const dateRequest = {
        ...sampleRequest,
        csvValue: '2025-07-19',
        webValue: 'July 19, 2025',
        fieldType: 'date',
        fieldName: 'created_date'
      };

      const result = await llmEngine.makeValidationDecision(dateRequest);

      expect(result.match).toBe(true);
      expect(result.reasoning).toContain('date');
    }, 15000);
  });

  describe('performance', () => {
    test('should complete validation within reasonable time', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const startTime = Date.now();
      
      await llmEngine.makeValidationDecision({
        csvValue: 'Test Value',
        webValue: 'Test Value',
        fieldType: 'string',
        fieldName: 'test_field'
      });

      const duration = Date.now() - startTime;
      
      // Should complete within 5 seconds for simple validation
      expect(duration).toBeLessThan(5000);
    }, 10000);

    test('should handle batch requests efficiently', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const requests = Array.from({ length: 5 }, (_, i) => ({
        csvValue: `Value ${i}`,
        webValue: `Value ${i}`,
        fieldType: 'string',
        fieldName: `field_${i}`
      }));

      const startTime = Date.now();
      
      const results = await Promise.all(
        requests.map(req => llmEngine.makeValidationDecision(req))
      );

      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.match).toBe(true);
      });
      
      // Should complete batch within 15 seconds
      expect(duration).toBeLessThan(15000);
    }, 20000);
  });

  describe('error handling', () => {
    test('should handle malformed prompts gracefully', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const malformedRequest = {
        csvValue: null,
        webValue: undefined,
        fieldType: '',
        fieldName: ''
      };

      const result = await llmEngine.makeValidationDecision(malformedRequest);
      
      expect(result).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.issues?.length).toBeGreaterThan(0);
    });

    test('should recover from temporary LLM failures', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      // Test with invalid request that should trigger fallback
      const result = await llmEngine.makeValidationDecision({
        csvValue: null,
        webValue: undefined,
        fieldType: '',
        fieldName: ''
      });

      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(1.0); // Should have lower confidence due to issues
    });
  });
});
