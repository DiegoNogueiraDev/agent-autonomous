import { constants } from 'fs';
import { access, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';
import type { ValidationConfig } from '../types/index.js';

// Validation schemas for configuration - updated to match YAML structure
const FieldMappingSchema = z.object({
  csv_field: z.string().min(1),
  web_selector: z.string().min(1),
  field_type: z.enum(['text', 'email', 'phone', 'currency', 'date', 'name', 'address', 'number', 'boolean']),
  required: z.boolean(),
  validation_strategy: z.enum(['dom_extraction', 'ocr_extraction', 'hybrid', 'fuzzy_match']),
  custom_rules: z.array(z.object({
    name: z.string(),
    regex: z.string().optional(),
    function: z.string().optional(),
    params: z.record(z.any()).optional(),
    error_message: z.string()
  })).optional()
});

const ValidationConfigSchema = z.object({
  target_url: z.string().url(),
  field_mappings: z.array(FieldMappingSchema),
  confidence: z.object({
    minimum_overall: z.number().min(0).max(1),
    minimum_field: z.number().min(0).max(1),
    ocr_threshold: z.number().min(0).max(1),
    fuzzy_match_threshold: z.number().min(0).max(1)
  }),
  fuzzy_matching: z.object({
    enabled: z.boolean(),
    algorithms: z.array(z.string()),
    string_similarity_threshold: z.number().min(0).max(1),
    number_tolerance: z.number().min(0),
    case_insensitive: z.boolean(),
    ignore_whitespace: z.boolean()
  }),
  normalization: z.object({
    whitespace: z.object({
      trim_leading: z.boolean(),
      trim_trailing: z.boolean(),
      normalize_internal: z.boolean()
    }),
    case: z.record(z.string()),
    special_characters: z.object({
      remove_accents: z.boolean(),
      normalize_quotes: z.boolean(),
      normalize_dashes: z.boolean()
    }),
    numbers: z.object({
      decimal_separator: z.string(),
      thousand_separator: z.string(),
      currency_symbol_remove: z.boolean()
    }),
    dates: z.object({
      target_format: z.string(),
      input_formats: z.array(z.string())
    })
  }),
  error_handling: z.object({
    max_retry_attempts: z.number().min(0),
    retry_delay_ms: z.number().min(0),
    exponential_backoff: z.boolean(),
    critical_errors: z.array(z.string()),
    recoverable_errors: z.array(z.string()),
    escalation_threshold: z.number().min(0).max(1)
  }),
  performance: z.object({
    batch_processing: z.boolean(),
    batch_size: z.number().min(1),
    parallel_workers: z.number().min(1),
    caching: z.object({
      dom_snapshots: z.boolean(),
      ocr_results: z.boolean(),
      validation_decisions: z.boolean(),
      ttl: z.number().min(0)
    }),
    timeouts: z.object({
      navigation: z.number().min(0),
      dom_extraction: z.number().min(0),
      ocr_processing: z.number().min(0),
      validation_decision: z.number().min(0),
      evidence_collection: z.number().min(0)
    })
  }),
  evidence: z.object({
    retention_days: z.number().min(0),
    screenshot_enabled: z.boolean(),
    dom_snapshot_enabled: z.boolean(),
    compression_enabled: z.boolean(),
    include_in_reports: z.boolean()
  })
});

// Internal schema for camelCase conversion
const InternalValidationConfigSchema = z.object({
  targetUrl: z.string().url(),
  fieldMappings: z.array(z.object({
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
  })),
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
   * Load and validate configuration from YAML file with snake_case to camelCase conversion
   */
  async loadValidationConfig(configPath: string): Promise<ValidationConfig> {
    try {
      // Check if file exists
      await access(configPath, constants.F_OK);

      const configContent = await readFile(configPath, 'utf-8');
      const rawConfig = parseYaml(configContent);

      // Convert snake_case to camelCase
      const normalizedConfig = this.normalizeConfigKeys(rawConfig);

      // Validate configuration against internal schema
      const validatedConfig = InternalValidationConfigSchema.parse(normalizedConfig);

      return validatedConfig as ValidationConfig;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

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
   * Convert snake_case keys to camelCase
   */
  private normalizeConfigKeys(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeConfigKeys(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Convert snake_case to camelCase
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        result[camelKey] = this.normalizeConfigKeys(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * Convert camelCase keys to snake_case for YAML output
   */
  private denormalizeConfigKeys(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.denormalizeConfigKeys(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        result[snakeKey] = this.denormalizeConfigKeys(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * Generate sample configuration
   */
  async generateSampleConfig(outputPath: string): Promise<void> {
    const sampleConfig = {
      target_url: 'https://example.com/users/{id}',
      field_mappings: [
        {
          csv_field: 'id',
          web_selector: '#user-id',
          field_type: 'text',
          required: true,
          validation_strategy: 'dom_extraction'
        },
        {
          csv_field: 'name',
          web_selector: '.user-name',
          field_type: 'name',
          required: true,
          validation_strategy: 'hybrid'
        },
        {
          csv_field: 'email',
          web_selector: '[data-testid="email"]',
          field_type: 'email',
          required: true,
          validation_strategy: 'dom_extraction'
        }
      ],
      confidence: {
        minimum_overall: 0.8,
        minimum_field: 0.7,
        ocr_threshold: 0.6,
        fuzzy_match_threshold: 0.85
      },
      fuzzy_matching: {
        enabled: true,
        algorithms: ['levenshtein'],
        string_similarity_threshold: 0.85,
        number_tolerance: 0.001,
        case_insensitive: true,
        ignore_whitespace: true
      },
      normalization: {
        whitespace: {
          trim_leading: true,
          trim_trailing: true,
          normalize_internal: true
        },
        case: {
          email: 'lowercase',
          name: 'title_case',
          text: 'preserve'
        },
        special_characters: {
          remove_accents: false,
          normalize_quotes: false,
          normalize_dashes: false
        },
        numbers: {
          decimal_separator: '.',
          thousand_separator: ',',
          currency_symbol_remove: false
        },
        dates: {
          target_format: 'YYYY-MM-DD',
          input_formats: ['YYYY-MM-DD']
        }
      },
      error_handling: {
        max_retry_attempts: 3,
        retry_delay_ms: 1000,
        exponential_backoff: false,
        critical_errors: [],
        recoverable_errors: [],
        escalation_threshold: 0.1
      },
      performance: {
        batch_processing: true,
        batch_size: 10,
        parallel_workers: 3,
        caching: {
          dom_snapshots: true,
          ocr_results: true,
          validation_decisions: false,
          ttl: 3600
        },
        timeouts: {
          navigation: 30000,
          dom_extraction: 15000,
          ocr_processing: 45000,
          validation_decision: 30000,
          evidence_collection: 10000
        }
      },
      evidence: {
        retention_days: 30,
        screenshot_enabled: true,
        dom_snapshot_enabled: true,
        compression_enabled: true,
        include_in_reports: true
      }
    };

    // Convert to YAML format
    const yamlContent = stringifyYaml(sampleConfig, {
      indent: 2,
      lineWidth: -1 // No line wrapping
    });

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));

    // Write to file
    await writeFile(outputPath, yamlContent, 'utf-8');
  }

  /**
   * Merge multiple configuration objects with deep merge logic
   */
  mergeConfigs(baseConfig: ValidationConfig, overrideConfig: Partial<ValidationConfig>): ValidationConfig {
    return {
      ...baseConfig,
      ...overrideConfig,
      fieldMappings: [...(baseConfig.fieldMappings || []), ...(overrideConfig.fieldMappings || [])],
      validationRules: {
        ...baseConfig.validationRules,
        ...overrideConfig.validationRules,
        confidence: { ...baseConfig.validationRules?.confidence, ...overrideConfig.validationRules?.confidence },
        fuzzyMatching: { ...baseConfig.validationRules?.fuzzyMatching, ...overrideConfig.validationRules?.fuzzyMatching },
        normalization: { ...baseConfig.validationRules?.normalization, ...overrideConfig.validationRules?.normalization },
        errorHandling: { ...baseConfig.validationRules?.errorHandling, ...overrideConfig.validationRules?.errorHandling }
      },
      performance: {
        ...baseConfig.performance,
        ...overrideConfig.performance,
        caching: { ...baseConfig.performance?.caching, ...overrideConfig.performance?.caching },
        timeouts: { ...baseConfig.performance?.timeouts, ...overrideConfig.performance?.timeouts }
      },
      evidence: { ...baseConfig.evidence, ...overrideConfig.evidence }
    };
  }

  /**
   * Save validation configuration to YAML file
   */
  async saveValidationConfig(filePath: string, config: ValidationConfig): Promise<void> {
    try {
      // Validate configuration before saving
      const validatedConfig = InternalValidationConfigSchema.parse(config);

      // Convert camelCase to snake_case for YAML
      const yamlConfig = this.denormalizeConfigKeys(validatedConfig);

      // Convert to YAML format
      const yamlContent = stringifyYaml(yamlConfig, {
        indent: 2,
        lineWidth: -1 // No line wrapping
      });

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));

      // Write to file
      await writeFile(filePath, yamlContent, 'utf-8');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err =>
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        throw new Error(`Configuration validation failed before save: ${errorMessages}`);
      }

      if (error instanceof Error) {
        throw new Error(`Failed to save configuration: ${error.message}`);
      }

      throw new Error('Failed to save configuration: Unknown error');
    }
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
