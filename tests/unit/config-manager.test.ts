import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigManager } from '../../src/core/config-manager';
import type { ValidationConfig } from '../../src/types/index';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let testConfigPath: string;

  beforeEach(async () => {
    configManager = new ConfigManager();
    
    // Create temporary directory for test configs
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    testConfigPath = path.join(tempDir, 'test-config.yaml');
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('configuration loading', () => {
    test('should load valid YAML configuration', async () => {
      const configContent = `
targetUrl: "https://example.com/user/{id}"
fieldMappings:
  - csvField: "name"
    webSelector: "h1.profile-name"
    fieldType: "string"
    required: true
validationRules:
  confidence:
    minimumOverall: 0.8
    minimumField: 0.6
performance:
  batchSize: 10
  parallelWorkers: 3
evidence:
  retention: 30
  screenshots: true
`;

      await fs.writeFile(testConfigPath, configContent);
      
      const config = await configManager.loadValidationConfig(testConfigPath);
      
      expect(config.targetUrl).toBe('https://example.com/user/{id}');
      expect(config.fieldMappings).toHaveLength(1);
      expect(config.fieldMappings[0].csvField).toBe('name');
      expect(config.validationRules.confidence.minimumOverall).toBe(0.8);
    });

    test('should reject invalid configuration schema', async () => {
      const invalidConfig = `
invalidField: "value"
missingRequiredFields: true
`;

      await fs.writeFile(testConfigPath, invalidConfig);
      
      await expect(configManager.loadValidationConfig(testConfigPath))
        .rejects.toThrow();
    });

    test('should handle missing file gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.yaml');
      
      await expect(configManager.loadValidationConfig(nonExistentPath))
        .rejects.toThrow();
    });

    test('should handle malformed YAML', async () => {
      const malformedYaml = `
targetUrl: "https://example.com"
fieldMappings:
  - csvField: "name"
    webSelector: h1.profile-name"
    invalidIndentation
`;

      await fs.writeFile(testConfigPath, malformedYaml);
      
      await expect(configManager.loadValidationConfig(testConfigPath))
        .rejects.toThrow();
    });
  });

  describe('configuration validation', () => {
    test('should validate field mappings', async () => {
      const configContent = `
targetUrl: "https://example.com"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
    required: true
  - csvField: "email" 
    webSelector: "input[type=email]"
    fieldType: "email"
    required: false
validationRules:
  confidence:
    minimumOverall: 0.8
`;

      await fs.writeFile(testConfigPath, configContent);
      
      const config = await configManager.loadValidationConfig(testConfigPath);
      
      expect(config.fieldMappings).toHaveLength(2);
      expect(config.fieldMappings[0].required).toBe(true);
      expect(config.fieldMappings[1].required).toBe(false);
    });

    test('should validate URL template format', async () => {
      const configContent = `
targetUrl: "https://example.com/user/{id}/profile"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
`;

      await fs.writeFile(testConfigPath, configContent);
      
      const config = await configManager.loadValidationConfig(testConfigPath);
      
      expect(config.targetUrl).toContain('{id}');
    });

    test('should apply default values for optional fields', async () => {
      const minimalConfig = `
targetUrl: "https://example.com"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
`;

      await fs.writeFile(testConfigPath, minimalConfig);
      
      const config = await configManager.loadValidationConfig(testConfigPath);
      
      // Should apply defaults
      expect(config.validationRules.confidence.minimumOverall).toBeDefined();
      expect(config.performance.batchSize).toBeDefined();
      expect(config.evidence.retention).toBeDefined();
    });
  });

  describe('environment variable interpolation', () => {
    test('should interpolate environment variables', async () => {
      // Set test environment variable
      process.env.TEST_BASE_URL = 'https://test.example.com';
      
      const configContent = `
targetUrl: "\${TEST_BASE_URL}/user/{id}"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
`;

      await fs.writeFile(testConfigPath, configContent);
      
      const config = await configManager.loadValidationConfig(testConfigPath);
      
      expect(config.targetUrl).toBe('https://test.example.com/user/{id}');
      
      // Cleanup
      delete process.env.TEST_BASE_URL;
    });

    test('should handle missing environment variables', async () => {
      const configContent = `
targetUrl: "\${NON_EXISTENT_VAR}/user/{id}"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
`;

      await fs.writeFile(testConfigPath, configContent);
      
      const config = await configManager.loadValidationConfig(testConfigPath);
      
      // Should leave placeholder as-is when env var doesn't exist
      expect(config.targetUrl).toBe('${NON_EXISTENT_VAR}/user/{id}');
    });
  });

  describe('configuration merging', () => {
    test('should merge multiple configuration sources', async () => {
      const baseConfig = {
        targetUrl: 'https://example.com',
        fieldMappings: [{
          csvField: 'name',
          webSelector: 'h1',
          fieldType: 'string' as const,
          required: true
        }]
      };

      const overrideConfig = {
        validationRules: {
          confidence: {
            minimumOverall: 0.9,
            minimumField: 0.7
          }
        }
      };

      const merged = configManager.mergeConfigs(baseConfig, overrideConfig);
      
      expect(merged.targetUrl).toBe(baseConfig.targetUrl);
      expect(merged.fieldMappings).toEqual(baseConfig.fieldMappings);
      expect(merged.validationRules.confidence.minimumOverall).toBe(0.9);
    });
  });

  describe('configuration saving', () => {
    test('should save configuration to YAML file', async () => {
      const config: ValidationConfig = {
        targetUrl: 'https://example.com',
        fieldMappings: [{
          csvField: 'name',
          webSelector: 'h1',
          fieldType: 'string',
          required: true
        }],
        validationRules: {
          confidence: {
            minimumOverall: 0.8,
            minimumField: 0.6,
            ocrThreshold: 0.7,
            fuzzyMatchThreshold: 0.8
          },
          fuzzyMatching: {
            enabled: true,
            stringSimilarityThreshold: 0.8,
            caseInsensitive: true,
            ignoreWhitespace: true
          }
        },
        performance: {
          batchSize: 10,
          parallelWorkers: 3,
          timeout: 30000,
          retryAttempts: 2
        },
        evidence: {
          retention: 30,
          screenshots: true,
          domSnapshots: true,
          compressionAfter: 7
        }
      };

      await configManager.saveValidationConfig(testConfigPath, config);
      
      // Verify file was created and can be loaded back
      const loadedConfig = await configManager.loadValidationConfig(testConfigPath);
      
      expect(loadedConfig.targetUrl).toBe(config.targetUrl);
      expect(loadedConfig.fieldMappings).toEqual(config.fieldMappings);
    });
  });

  describe('configuration validation rules', () => {
    test('should validate confidence thresholds are within valid range', async () => {
      const configContent = `
targetUrl: "https://example.com"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
validationRules:
  confidence:
    minimumOverall: 1.5
`;

      await fs.writeFile(testConfigPath, configContent);
      
      await expect(configManager.loadValidationConfig(testConfigPath))
        .rejects.toThrow();
    });

    test('should validate performance settings', async () => {
      const configContent = `
targetUrl: "https://example.com"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "string"
performance:
  batchSize: -1
  parallelWorkers: 0
`;

      await fs.writeFile(testConfigPath, configContent);
      
      await expect(configManager.loadValidationConfig(testConfigPath))
        .rejects.toThrow();
    });
  });

  describe('template validation', () => {
    test('should validate URL template syntax', () => {
      const validTemplates = [
        'https://example.com/user/{id}',
        'https://example.com/{category}/{id}',
        'https://example.com/user/{user_id}/profile'
      ];

      validTemplates.forEach(template => {
        expect(configManager.validateUrlTemplate(template)).toBe(true);
      });
    });

    test('should reject invalid URL templates', () => {
      const invalidTemplates = [
        'not-a-url',
        'https://example.com/{unclosed',
        'https://example.com/user/}invalid{',
        ''
      ];

      invalidTemplates.forEach(template => {
        expect(configManager.validateUrlTemplate(template)).toBe(false);
      });
    });
  });

  describe('field mapping validation', () => {
    test('should validate CSS selectors', () => {
      const validSelectors = [
        'h1',
        '.profile-name',
        '#user-email',
        'input[type="email"]',
        'div.container > p.description'
      ];

      validSelectors.forEach(selector => {
        expect(configManager.validateCssSelector(selector)).toBe(true);
      });
    });

    test('should reject invalid CSS selectors', () => {
      const invalidSelectors = [
        '',
        '>>invalid',
        'div..double-class',
        'input[unclosed'
      ];

      invalidSelectors.forEach(selector => {
        expect(configManager.validateCssSelector(selector)).toBe(false);
      });
    });
  });
});