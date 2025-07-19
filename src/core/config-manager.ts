import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { ValidationConfig } from '../types/index.js';

// Validation schemas for configuration
const FieldMappingSchema = z.object({
  csvField: z.string().min(1),
  webSelector: z.string().min(1),
  fieldType: z.enum(['text', 'email', 'phone', 'currency', 'date', 'name', 'address', 'number', 'boolean']),
  required: z.boolean(),
  validationStrategy: z.enum(['dom_extraction', 'ocr_extraction', 'hybrid', 'fuzzy_match']),
  customRules: z.array(z.object({
    name: z.string(),
    regex: z.string().optional(),
    function: z.string().optional(),
    params: z.record(z.any()).optional(),
    errorMessage: z.string()
  })).optional()
});

const ValidationConfigSchema = z.object({
  targetUrl: z.string().url(),
  fieldMappings: z.array(FieldMappingSchema),
  validationRules: z.object({
    confidence: z.object({
      minimumOverall: z.number().min(0).max(1),
      minimumField: z.number().min(0).max(1),
      ocrThreshold: z.number().min(0).max(1),
      fuzzyMatchThreshold: z.number().min(0).max(1)
    }),
    fuzzyMatching: z.object({
      enabled: z.boolean(),
      algorithms: z.array(z.string()),
      stringSimilarityThreshold: z.number().min(0).max(1),
      numberTolerance: z.number().min(0),
      caseInsensitive: z.boolean(),
      ignoreWhitespace: z.boolean()
    }),
    normalization: z.object({
      whitespace: z.object({
        trimLeading: z.boolean(),
        trimTrailing: z.boolean(),
        normalizeInternal: z.boolean()
      }),
      case: z.record(z.string()),
      specialCharacters: z.object({
        removeAccents: z.boolean(),
        normalizeQuotes: z.boolean(),
        normalizeDashes: z.boolean()
      }),
      numbers: z.object({
        decimalSeparator: z.string(),
        thousandSeparator: z.string(),
        currencySymbolRemove: z.boolean()
      }),
      dates: z.object({
        targetFormat: z.string(),
        inputFormats: z.array(z.string())
      })
    }),
    errorHandling: z.object({
      maxRetryAttempts: z.number().min(0),
      retryDelayMs: z.number().min(0),
      exponentialBackoff: z.boolean(),
      criticalErrors: z.array(z.string()),
      recoverableErrors: z.array(z.string()),
      escalationThreshold: z.number().min(0).max(1)
    })
  }),
  performance: z.object({
    batchProcessing: z.boolean(),
    batchSize: z.number().min(1),
    parallelWorkers: z.number().min(1),
    caching: z.object({
      domSnapshots: z.boolean(),
      ocrResults: z.boolean(),
      validationDecisions: z.boolean(),
      ttl: z.number().min(0)
    }),
    timeouts: z.object({
      navigation: z.number().min(0),
      domExtraction: z.number().min(0),
      ocrProcessing: z.number().min(0),
      validationDecision: z.number().min(0),
      evidenceCollection: z.number().min(0)
    })
  }),
  evidence: z.object({
    retentionDays: z.number().min(0),
    screenshotEnabled: z.boolean(),
    domSnapshotEnabled: z.boolean(),
    compressionEnabled: z.boolean(),
    includeInReports: z.boolean()
  })
});

export class ConfigManager {
  /**
   * Load and validate configuration from YAML file
   */
  async loadValidationConfig(configPath: string): Promise<ValidationConfig> {
    try {
      const configContent = await readFile(configPath, 'utf-8');
      const rawConfig = parseYaml(configContent);
      
      // Validate configuration against schema
      const validatedConfig = ValidationConfigSchema.parse(rawConfig);
      
      return validatedConfig as ValidationConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        throw new Error(`Configuration validation failed: ${errorMessages}`);
      }
      
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
      }
      
      throw new Error('Failed to load configuration: Unknown error');
    }
  }

  /**
   * Validate configuration file
   */
  async validateConfiguration(configPath: string): Promise<void> {
    await this.loadValidationConfig(configPath);
  }

  /**
   * Generate sample configuration
   */
  async generateSampleConfig(outputPath: string): Promise<void> {
    // TODO: Fix type issues - using placeholder for now
    throw new Error('Sample config generation temporarily disabled - type issues to resolve');
    /*
    const sampleConfig: any = {
      targetUrl: 'https://example.com/users/{id}',
      fieldMappings: [
        {
          csvField: 'id',
          webSelector: '#user-id',
          fieldType: 'text',
          required: true,
          validationStrategy: 'dom_extraction'
        },
        {
          csvField: 'name',
          webSelector: '.user-name',
          fieldType: 'name',
          required: true,
          validationStrategy: 'hybrid'
        },
        {
          csvField: 'email',
          webSelector: '[data-testid="email"]',
          fieldType: 'email',
          required: true,
          validationStrategy: 'dom_extraction'
        }
      ],
      validationRules: {
        confidence: {
          minimumOverall: 0.8,
          minimumField: 0.7,
          ocrThreshold: 0.6,
          fuzzyMatchThreshold: 0.85
        },
        fuzzyMatching: {
          enabled: true,
          algorithms: ['levenshtein', 'jaro_winkler'],
          stringSimilarityThreshold: 0.85,
          numberTolerance: 0.001,
          caseInsensitive: true,
          ignoreWhitespace: true
        },
        normalization: {
          whitespace: {
            trimLeading: true,
            trimTrailing: true,
            normalizeInternal: true
          },
          case: {
            email: 'lowercase',
            name: 'title_case', 
            text: 'preserve'
          } as any,
          specialCharacters: {
            removeAccents: true,
            normalizeQuotes: true,
            normalizeDashes: true
          },
          numbers: {
            decimalSeparator: '.',
            thousandSeparator: ',',
            currencySymbolRemove: true
          },
          dates: {
            targetFormat: 'YYYY-MM-DD',
            inputFormats: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']
          }
        },
        errorHandling: {
          maxRetryAttempts: 3,
          retryDelayMs: 2000,
          exponentialBackoff: true,
          criticalErrors: ['navigation_timeout', 'page_not_found'],
          recoverableErrors: ['element_not_found', 'ocr_low_confidence'],
          escalationThreshold: 0.1
        }
      },
      performance: {
        batchProcessing: true,
        batchSize: 10,
        parallelWorkers: 3,
        caching: {
          domSnapshots: true,
          ocrResults: true,
          validationDecisions: false,
          ttl: 3600
        },
        timeouts: {
          navigation: 30000,
          domExtraction: 15000,
          ocrProcessing: 45000,
          validationDecision: 30000,
          evidenceCollection: 10000
        }
      },
      evidence: {
        retentionDays: 30,
        screenshotEnabled: true,
        domSnapshotEnabled: true,
        compressionEnabled: true,
        includeInReports: true
      }
    };

    const { writeFile } = await import('fs/promises');
    const yaml = await import('yaml');
    
    await writeFile(outputPath, yaml.stringify(sampleConfig, null, 2));
    */
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): any {
    return {
      validationRules: {
        confidence: {
          minimumOverall: 0.8,
          minimumField: 0.7,
          ocrThreshold: 0.6,
          fuzzyMatchThreshold: 0.85
        },
        fuzzyMatching: {
          enabled: true,
          algorithms: ['levenshtein'],
          stringSimilarityThreshold: 0.85,
          numberTolerance: 0.001,
          caseInsensitive: true,
          ignoreWhitespace: true
        },
        normalization: {
          whitespace: {
            trimLeading: true,
            trimTrailing: true,
            normalizeInternal: true
          },
          case: {
            email: 'lowercase',
            name: 'title_case', 
            text: 'preserve'
          } as any,
          specialCharacters: {
            removeAccents: false,
            normalizeQuotes: false,
            normalizeDashes: false
          },
          numbers: {
            decimalSeparator: '.',
            thousandSeparator: ',',
            currencySymbolRemove: false
          },
          dates: {
            targetFormat: 'YYYY-MM-DD',
            inputFormats: ['YYYY-MM-DD']
          }
        },
        errorHandling: {
          maxRetryAttempts: 3,
          retryDelayMs: 1000,
          exponentialBackoff: false,
          criticalErrors: [],
          recoverableErrors: [],
          escalationThreshold: 0.1
        }
      }
    };
  }
}