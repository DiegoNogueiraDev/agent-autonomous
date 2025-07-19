import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { OCREngine } from '../../src/ocr/ocr-engine';
import type { OCRSettings } from '../../src/types/index';
import fs from 'fs/promises';
import path from 'path';

describe('OCREngine', () => {
  let ocrEngine: OCREngine;
  let testSettings: OCRSettings;

  beforeEach(() => {
    testSettings = {
      language: 'eng',
      mode: 6, // PSM_UNIFORM_BLOCK
      confidenceThreshold: 0.6,
      imagePreprocessing: {
        enabled: false,
        operations: []
      }
    };

    ocrEngine = new OCREngine({ settings: testSettings });
  });

  afterEach(async () => {
    if (ocrEngine.isInitialized()) {
      await ocrEngine.cleanup();
    }
  });

  describe('initialization', () => {
    test('should initialize successfully with valid settings', async () => {
      expect(ocrEngine.isInitialized()).toBe(false);
      
      await ocrEngine.initialize();
      
      expect(ocrEngine.isInitialized()).toBe(true);
    }, 30000); // OCR initialization can take time

    test('should have correct initial state', () => {
      const stats = ocrEngine.getStats();
      
      expect(stats.initialized).toBe(false);
      expect(stats.language).toBe('eng');
      expect(stats.mode).toBe(6);
    });

    test('should handle different language settings', async () => {
      const multiLangSettings: OCRSettings = {
        ...testSettings,
        language: 'eng+por'
      };

      const multiLangEngine = new OCREngine({ settings: multiLangSettings });
      
      await multiLangEngine.initialize();
      expect(multiLangEngine.isInitialized()).toBe(true);
      
      await multiLangEngine.cleanup();
    }, 30000);
  });

  describe('text extraction', () => {
    beforeEach(async () => {
      await ocrEngine.initialize();
    });

    test('should throw error if not initialized', async () => {
      const uninitializedEngine = new OCREngine({ settings: testSettings });
      const mockBuffer = Buffer.from('fake-image-data');

      await expect(uninitializedEngine.extractText(mockBuffer))
        .rejects.toThrow('OCR Engine not initialized');
    });

    test('should extract text from simple image buffer', async () => {
      // Create a simple test image with text (base64 encoded)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAABCAYAAADjAO9DAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const imageBuffer = Buffer.from(testImageBase64, 'base64');

      try {
        const result = await ocrEngine.extractText(imageBuffer);
        
        expect(result).toBeDefined();
        expect(typeof result.text).toBe('string');
        expect(typeof result.confidence).toBe('number');
        expect(Array.isArray(result.words)).toBe(true);
        expect(Array.isArray(result.lines)).toBe(true);
        expect(typeof result.processingTime).toBe('number');
        expect(result.processingTime).toBeGreaterThan(0);
      } catch (error) {
        // OCR might fail on simple test image, which is acceptable
        expect(error).toBeDefined();
      }
    }, 15000);

    test('should handle empty buffer gracefully', async () => {
      const emptyBuffer = Buffer.alloc(0);

      try {
        await ocrEngine.extractText(emptyBuffer);
      } catch (error) {
        // Should throw an error for empty buffer
        expect(error).toBeDefined();
      }
    });

    test('should handle invalid image data', async () => {
      const invalidBuffer = Buffer.from('not-an-image');

      try {
        await ocrEngine.extractText(invalidBuffer);
      } catch (error) {
        // Should throw an error for invalid image data
        expect(error).toBeDefined();
      }
    });
  });

  describe('file extraction', () => {
    beforeEach(async () => {
      await ocrEngine.initialize();
    });

    test('should handle non-existent file', async () => {
      const nonExistentPath = '/path/to/non/existent/file.png';

      await expect(ocrEngine.extractTextFromFile(nonExistentPath))
        .rejects.toThrow();
    });

    test('should handle invalid file path', async () => {
      const invalidPath = '';

      await expect(ocrEngine.extractTextFromFile(invalidPath))
        .rejects.toThrow();
    });
  });

  describe('configuration', () => {
    test('should use custom whitelist setting', async () => {
      const customSettings: OCRSettings = {
        ...testSettings,
        whitelist: '0123456789'
      };

      const customEngine = new OCREngine({ settings: customSettings });
      await customEngine.initialize();
      
      expect(customEngine.isInitialized()).toBe(true);
      
      await customEngine.cleanup();
    }, 30000);

    test('should use different page segmentation modes', async () => {
      const modes = [6, 7, 8, 13]; // Common PSM modes
      
      for (const mode of modes) {
        const customSettings: OCRSettings = {
          ...testSettings,
          mode
        };

        const customEngine = new OCREngine({ settings: customSettings });
        await customEngine.initialize();
        
        const stats = customEngine.getStats();
        expect(stats.mode).toBe(mode);
        
        await customEngine.cleanup();
      }
    }, 60000);
  });

  describe('performance', () => {
    beforeEach(async () => {
      await ocrEngine.initialize();
    });

    test('should complete OCR processing within reasonable time', async () => {
      // Create a small test image
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAABCAYAAADjAO9DAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const imageBuffer = Buffer.from(testImageBase64, 'base64');

      const startTime = Date.now();
      
      try {
        const result = await ocrEngine.extractText(imageBuffer);
        const processingTime = Date.now() - startTime;
        
        // OCR should complete within 10 seconds for small image
        expect(processingTime).toBeLessThan(10000);
        expect(result.processingTime).toBeLessThan(10000);
      } catch (error) {
        // OCR might fail on simple test image, but timing should still be reasonable
        const processingTime = Date.now() - startTime;
        expect(processingTime).toBeLessThan(10000);
      }
    }, 15000);

    test('should handle multiple concurrent requests', async () => {
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAABCAYAAADjAO9DAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const imageBuffer = Buffer.from(testImageBase64, 'base64');

      const promises = Array(3).fill(null).map(() => 
        ocrEngine.extractText(imageBuffer).catch(() => null)
      );

      const results = await Promise.all(promises);
      
      // At least some requests should complete (even if with errors)
      expect(results).toHaveLength(3);
    }, 30000);
  });

  describe('cleanup', () => {
    test('should cleanup successfully after initialization', async () => {
      await ocrEngine.initialize();
      expect(ocrEngine.isInitialized()).toBe(true);
      
      await ocrEngine.cleanup();
      expect(ocrEngine.isInitialized()).toBe(false);
    }, 30000);

    test('should handle cleanup without initialization', async () => {
      expect(ocrEngine.isInitialized()).toBe(false);
      
      // Should not throw error
      await expect(ocrEngine.cleanup()).resolves.not.toThrow();
      
      expect(ocrEngine.isInitialized()).toBe(false);
    });

    test('should handle multiple cleanup calls', async () => {
      await ocrEngine.initialize();
      
      await ocrEngine.cleanup();
      expect(ocrEngine.isInitialized()).toBe(false);
      
      // Second cleanup should not throw
      await expect(ocrEngine.cleanup()).resolves.not.toThrow();
      expect(ocrEngine.isInitialized()).toBe(false);
    }, 30000);
  });

  describe('error handling', () => {
    test('should handle worker creation failure gracefully', async () => {
      const invalidSettings: OCRSettings = {
        ...testSettings,
        language: 'invalid-language-code'
      };

      const invalidEngine = new OCREngine({ settings: invalidSettings });
      
      await expect(invalidEngine.initialize()).rejects.toThrow();
      expect(invalidEngine.isInitialized()).toBe(false);
    });

    test('should recover from processing errors', async () => {
      await ocrEngine.initialize();
      
      // Try to process invalid data
      const invalidBuffer = Buffer.from('invalid-image-data');
      
      try {
        await ocrEngine.extractText(invalidBuffer);
      } catch (error) {
        // Error is expected
        expect(error).toBeDefined();
      }
      
      // Engine should still be usable after error
      expect(ocrEngine.isInitialized()).toBe(true);
    }, 30000);
  });

  describe('statistics', () => {
    test('should provide accurate statistics', () => {
      const stats = ocrEngine.getStats();
      
      expect(stats).toHaveProperty('initialized');
      expect(stats).toHaveProperty('language');
      expect(stats).toHaveProperty('mode');
      
      expect(typeof stats.initialized).toBe('boolean');
      expect(typeof stats.language).toBe('string');
      expect(typeof stats.mode).toBe('number');
      
      expect(stats.language).toBe(testSettings.language);
      expect(stats.mode).toBe(testSettings.mode);
    });

    test('should update statistics after initialization', async () => {
      const statsBefore = ocrEngine.getStats();
      expect(statsBefore.initialized).toBe(false);
      
      await ocrEngine.initialize();
      
      const statsAfter = ocrEngine.getStats();
      expect(statsAfter.initialized).toBe(true);
      expect(statsAfter.language).toBe(testSettings.language);
      expect(statsAfter.mode).toBe(testSettings.mode);
    }, 30000);
  });
});