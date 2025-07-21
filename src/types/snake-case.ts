/**
 * DataHawk Type Definitions - Snake Case Version
 * Compatível com arquivos de configuração YAML em formato snake_case
 */

import {
    CaseNormalization,
    CustomValidationRule,
    FieldType,
    ValidationStrategy
} from './index.js';

// ==================== Configuration Types (Snake Case) ====================

export interface SnakeCaseValidationConfig {
  target_url: string;
  field_mappings: SnakeCaseFieldMapping[];
  validation_rules: SnakeCaseValidationRules;
  performance: SnakeCasePerformanceSettings;
  evidence: SnakeCaseEvidenceSettings;
}

export interface SnakeCaseFieldMapping {
  csv_field: string;
  web_selector: string;
  field_type: FieldType;
  required: boolean;
  validation_strategy: ValidationStrategy;
  custom_rules?: CustomValidationRule[];
}

export interface SnakeCaseValidationRules {
  confidence: SnakeCaseConfidenceSettings;
  fuzzy_matching: SnakeCaseFuzzyMatchingSettings;
  normalization: SnakeCaseNormalizationSettings;
  error_handling: SnakeCaseErrorHandlingSettings;
}

export interface SnakeCaseErrorHandlingSettings {
  max_retry_attempts: number;
  retry_delay_ms: number;
  exponential_backoff: boolean;
  critical_errors: string[];
  recoverable_errors: string[];
  escalation_threshold: number;
}

export interface SnakeCaseConfidenceSettings {
  minimum_overall: number;
  minimum_field: number;
  ocr_threshold: number;
  fuzzy_match_threshold: number;
}

export interface SnakeCaseFuzzyMatchingSettings {
  enabled: boolean;
  algorithms: string[];
  string_similarity_threshold: number;
  number_tolerance: number;
  case_insensitive: boolean;
  ignore_whitespace: boolean;
}

export interface SnakeCaseWhitespaceNormalization {
  trim_leading: boolean;
  trim_trailing: boolean;
  normalize_internal: boolean;
}

export interface SnakeCaseSpecialCharNormalization {
  remove_accents: boolean;
  normalize_quotes: boolean;
  normalize_dashes: boolean;
}

export interface SnakeCaseNumberNormalization {
  decimal_separator: string;
  thousand_separator: string;
  currency_symbol_remove: boolean;
}

export interface SnakeCaseDateNormalization {
  target_format: string;
  input_formats: string[];
}

export interface SnakeCaseNormalizationSettings {
  whitespace: SnakeCaseWhitespaceNormalization;
  case: CaseNormalization;
  special_characters: SnakeCaseSpecialCharNormalization;
  numbers: SnakeCaseNumberNormalization;
  dates: SnakeCaseDateNormalization;
}

export interface SnakeCasePerformanceSettings {
  batch_processing: boolean;
  batch_size: number;
  parallel_workers: number;
  caching: SnakeCaseCachingSettings;
  timeouts: SnakeCaseTimeoutSettings;
}

export interface SnakeCaseCachingSettings {
  dom_snapshots: boolean;
  ocr_results: boolean;
  validation_decisions: boolean;
  ttl: number;
}

export interface SnakeCaseTimeoutSettings {
  navigation: number;
  dom_extraction: number;
  ocr_processing: number;
  validation_decision: number;
  evidence_collection: number;
}

export interface SnakeCaseEvidenceSettings {
  retention_days: number;
  screenshot_enabled: boolean;
  dom_snapshot_enabled: boolean;
  compression_enabled: boolean;
  include_in_reports: boolean;
}

// ==================== Conversion Functions ====================

/**
 * Converte configuração de snake_case para camelCase
 */
export function convertSnakeToCamel(snakeConfig: SnakeCaseValidationConfig): any {
  if (!snakeConfig) {
    return null;
  }

  return {
    targetUrl: snakeConfig.target_url,
    fieldMappings: snakeConfig.field_mappings?.map(mapping => ({
      csvField: mapping.csv_field,
      webSelector: mapping.web_selector,
      fieldType: mapping.field_type,
      required: mapping.required,
      validationStrategy: mapping.validation_strategy,
      customRules: mapping.custom_rules
    })) || [],
    validationRules: snakeConfig.validation_rules ? {
      confidence: snakeConfig.validation_rules.confidence ? {
        minimumOverall: snakeConfig.validation_rules.confidence.minimum_overall,
        minimumField: snakeConfig.validation_rules.confidence.minimum_field,
        ocrThreshold: snakeConfig.validation_rules.confidence.ocr_threshold,
        fuzzyMatchThreshold: snakeConfig.validation_rules.confidence.fuzzy_match_threshold
      } : undefined,
      fuzzyMatching: snakeConfig.validation_rules.fuzzy_matching ? {
        enabled: snakeConfig.validation_rules.fuzzy_matching.enabled,
        algorithms: snakeConfig.validation_rules.fuzzy_matching.algorithms,
        stringSimilarityThreshold: snakeConfig.validation_rules.fuzzy_matching.string_similarity_threshold,
        numberTolerance: snakeConfig.validation_rules.fuzzy_matching.number_tolerance,
        caseInsensitive: snakeConfig.validation_rules.fuzzy_matching.case_insensitive,
        ignoreWhitespace: snakeConfig.validation_rules.fuzzy_matching.ignore_whitespace
      } : undefined,
      normalization: snakeConfig.validation_rules.normalization ? {
        whitespace: snakeConfig.validation_rules.normalization.whitespace ? {
          trimLeading: snakeConfig.validation_rules.normalization.whitespace.trim_leading,
          trimTrailing: snakeConfig.validation_rules.normalization.whitespace.trim_trailing,
          normalizeInternal: snakeConfig.validation_rules.normalization.whitespace.normalize_internal
        } : undefined,
        case: snakeConfig.validation_rules.normalization.case,
        specialCharacters: snakeConfig.validation_rules.normalization.special_characters ? {
          removeAccents: snakeConfig.validation_rules.normalization.special_characters.remove_accents,
          normalizeQuotes: snakeConfig.validation_rules.normalization.special_characters.normalize_quotes,
          normalizeDashes: snakeConfig.validation_rules.normalization.special_characters.normalize_dashes
        } : undefined,
        numbers: snakeConfig.validation_rules.normalization.numbers ? {
          decimalSeparator: snakeConfig.validation_rules.normalization.numbers.decimal_separator,
          thousandSeparator: snakeConfig.validation_rules.normalization.numbers.thousand_separator,
          currencySymbolRemove: snakeConfig.validation_rules.normalization.numbers.currency_symbol_remove
        } : undefined,
        dates: snakeConfig.validation_rules.normalization.dates ? {
          targetFormat: snakeConfig.validation_rules.normalization.dates.target_format,
          inputFormats: snakeConfig.validation_rules.normalization.dates.input_formats
        } : undefined
      } : undefined,
      errorHandling: snakeConfig.validation_rules.error_handling ? {
        maxRetryAttempts: snakeConfig.validation_rules.error_handling.max_retry_attempts,
        retryDelayMs: snakeConfig.validation_rules.error_handling.retry_delay_ms,
        exponentialBackoff: snakeConfig.validation_rules.error_handling.exponential_backoff,
        criticalErrors: snakeConfig.validation_rules.error_handling.critical_errors,
        recoverableErrors: snakeConfig.validation_rules.error_handling.recoverable_errors,
        escalationThreshold: snakeConfig.validation_rules.error_handling.escalation_threshold
      } : undefined
    } : undefined,
    performance: snakeConfig.performance ? {
      batchProcessing: snakeConfig.performance.batch_processing,
      batchSize: snakeConfig.performance.batch_size,
      parallelWorkers: snakeConfig.performance.parallel_workers,
      caching: snakeConfig.performance.caching ? {
        domSnapshots: snakeConfig.performance.caching.dom_snapshots,
        ocrResults: snakeConfig.performance.caching.ocr_results,
        validationDecisions: snakeConfig.performance.caching.validation_decisions,
        ttl: snakeConfig.performance.caching.ttl
      } : undefined,
      timeouts: snakeConfig.performance.timeouts ? {
        navigation: snakeConfig.performance.timeouts.navigation,
        domExtraction: snakeConfig.performance.timeouts.dom_extraction,
        ocrProcessing: snakeConfig.performance.timeouts.ocr_processing,
        validationDecision: snakeConfig.performance.timeouts.validation_decision,
        evidenceCollection: snakeConfig.performance.timeouts.evidence_collection
      } : undefined
    } : undefined,
    evidence: snakeConfig.evidence ? {
      retentionDays: snakeConfig.evidence.retention_days,
      screenshotEnabled: snakeConfig.evidence.screenshot_enabled,
      domSnapshotEnabled: snakeConfig.evidence.dom_snapshot_enabled,
      compressionEnabled: snakeConfig.evidence.compression_enabled,
      includeInReports: snakeConfig.evidence.include_in_reports
    } : undefined
  };
}
