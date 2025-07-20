/**
 * DataHawk Type Definitions
 * Comprehensive type system for the autonomous QA browser agent
 */

// ==================== Core Data Types ====================

export interface CSVRow {
  [key: string]: string | number | boolean | null;
}

export interface CSVData {
  rows: CSVRow[];
  metadata: CSVMetadata;
}

export interface CSVMetadata {
  totalRows: number;
  delimiter: string;
  headers: string[];
  loadedAt: Date;
  filePath: string;
  fileSize: number;
}

// ==================== Configuration Types ====================

export interface ValidationConfig {
  targetUrl: string;
  fieldMappings: FieldMapping[];
  validationRules: ValidationRules;
  performance: PerformanceSettings;
  evidence: EvidenceSettings;
}

export interface FieldMapping {
  csvField: string;
  webSelector: string;
  fieldType: FieldType;
  required: boolean;
  validationStrategy: ValidationStrategy;
  customRules?: CustomValidationRule[];
}

export type FieldType = 
  | 'text' 
  | 'email' 
  | 'phone' 
  | 'currency' 
  | 'date' 
  | 'name' 
  | 'address' 
  | 'number'
  | 'boolean';

export type ValidationStrategy = 
  | 'dom_extraction' 
  | 'ocr_extraction' 
  | 'hybrid' 
  | 'fuzzy_match';

export interface ValidationRules {
  confidence: ConfidenceSettings;
  fuzzyMatching: FuzzyMatchingSettings;
  normalization: NormalizationSettings;
  errorHandling: ErrorHandlingSettings;
}

export interface ErrorHandlingSettings {
  maxRetryAttempts: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  criticalErrors: string[];
  recoverableErrors: string[];
  escalationThreshold: number;
}

export interface ConfidenceSettings {
  minimumOverall: number;
  minimumField: number;
  ocrThreshold: number;
  fuzzyMatchThreshold: number;
}

export interface FuzzyMatchingSettings {
  enabled: boolean;
  algorithms: string[];
  stringSimilarityThreshold: number;
  numberTolerance: number;
  caseInsensitive: boolean;
  ignoreWhitespace: boolean;
}

export interface NormalizationSettings {
  whitespace: WhitespaceNormalization;
  case: CaseNormalization;
  specialCharacters: SpecialCharNormalization;
  numbers: NumberNormalization;
  dates: DateNormalization;
}

// ==================== Processing Results ====================

export interface ValidationResult {
  rowId: string;
  rowIndex?: number;
  csvData: CSVRow;
  webData: ExtractedWebData;
  fieldValidations: FieldValidation[];
  validations?: FieldValidation[];
  overallMatch: boolean;
  overallConfidence: number;
  processingTime: number;
  evidenceId: string;
  errors: ValidationError[];
  metadata: ValidationMetadata;
  timestamp?: string;
  evidence?: any;
}

export interface FieldValidation {
  field: string;
  csvValue: any;
  webValue: any;
  normalizedCsvValue: any;
  normalizedWebValue: any;
  match: boolean;
  confidence: number;
  method: ExtractionMethod;
  reasoning: string;
  fuzzyScore?: number;
  evidence?: string;
}

export type ExtractionMethod = 'dom' | 'ocr' | 'fuzzy' | 'manual';

export interface ExtractedWebData {
  domData: Record<string, any>;
  ocrData: Record<string, any>;
  screenshots: Screenshot[];
  pageMetadata: PageMetadata;
  extractionMethods: Record<string, ExtractionMethod>;
  extractionConfidence: Record<string, number>;
}

export interface Screenshot {
  id: string;
  base64Data: string;
  data?: string;
  filename?: string;
  region?: BoundingBox;
  boundingBox?: any;
  timestamp: Date;
  quality: number;
  type: 'png' | 'jpeg' | 'element' | 'full-page';
  dimensions?: { width: number; height: number };
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageMetadata {
  url: string;
  title: string;
  loadTime: number;
  timestamp: Date;
  viewportSize: { width: number; height: number };
  userAgent: string;
  loadState?: string;
  viewport?: { width: number; height: number };
}

// ==================== CrewAI Types ====================

export interface AgentTask {
  type: string;
  description: string;
  data: any;
  priority?: 'low' | 'medium' | 'high';
  timeout?: number;
}

export interface CrewValidationResult {
  success: boolean;
  error?: string;
  processingTime: number;
  navigationResult?: any;
  extractionResults?: any;
  validationResults?: any;
  evidenceResult?: any;
  agentUtilization?: Record<string, any>;
}

export interface CrewConfig {
  maxConcurrentTasks: number;
  taskTimeout: number;
  retryAttempts: number;
  agentHealthCheck: boolean;
  performanceMonitoring: boolean;
}

// ==================== OCR Types ====================

export interface OCRResult {
  text: string;
  confidence: number;
  words: OCRWord[];
  lines: OCRLine[];
  processingTime: number;
  boundingBox?: BoundingBox;
  preprocessing?: string[] | null;
  language?: string;
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: OCRBoundingBox;
}

export interface OCRLine {
  text: string;
  confidence: number;
  bbox: OCRBoundingBox;
}

export interface OCRBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}


export type PreprocessingStep = 
  | 'contrast_enhancement'
  | 'noise_reduction'
  | 'sharpening'
  | 'binarization'
  | 'deskewing';

// ==================== Browser Automation Types ====================

export interface BrowserSettings {
  headless: boolean;
  viewport: { width: number; height: number };
  timeout: number;
  userAgent?: string;
  slowMo?: number;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  loadTime: number;
  statusCode?: number;
  redirectCount?: number;
  error?: string;
  errors: string[];
  redirects: string[];
  finalUrl: string;
}

// ==================== LLM Types ====================

export interface LLMSettings {
  modelPath: string;
  fallbackModelPath?: string;
  contextSize: number;
  batchSize: number;
  threads: number;
  gpuLayers: number;
  temperature: number;
  maxTokens: number;
}

export interface ValidationDecisionRequest {
  csvValue: any;
  webValue: any;
  fieldType: string;
  fieldName: string;
  context?: {
    otherFields?: Record<string, any>;
    metadata?: any;
  };
}

export interface ValidationDecisionResponse {
  match: boolean;
  confidence: number;
  reasoning: string;
  normalizedCsvValue: any;
  normalizedWebValue: any;
  issues?: string[];
}

export interface LLMResponse {
  text: string;
  confidence: number;
  tokens: number;
  processingTime: number;
  model: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  examples?: PromptExample[];
}

export interface PromptExample {
  input: Record<string, any>;
  output: string;
  reasoning?: string;
}

// ==================== Evidence & Reporting Types ====================

export interface Evidence {
  id: string;
  rowId: string;
  timestamp: Date;
  screenshots: Screenshot[];
  domSnapshot: string;
  extractedData: ExtractedWebData;
  validationResult: ValidationResult;
  metadata: EvidenceMetadata;
  files: EvidenceFile[];
}

export interface EvidenceFile {
  path: string;
  type: 'screenshot' | 'dom' | 'data' | 'log';
  size: number;
  checksum: string;
  compressed: boolean;
}

export interface EvidenceMetadata {
  version: string;
  retentionDate: Date;
  compressionRatio?: number;
  indexKey: string;
}

export interface Report {
  id: string;
  timestamp: Date;
  summary: ReportSummary;
  results: ValidationResult[];
  statistics: ReportStatistics;
  configuration: ValidationConfig;
  metadata: ReportMetadata;
}

export interface ReportSummary {
  totalRows: number;
  processedRows: number;
  successfulValidations: number;
  failedValidations: number;
  averageConfidence: number;
  processingTime: number;
  errorRate: number;
  performance?: {
    totalTasks: number;
    averageTaskTime: number;
    successRate: number;
    rowsPerSecond?: number;
    averageRowTime?: number;
  };
}

export interface ReportStatistics {
  totalRows?: number;
  validRows?: number;
  confidenceDistribution: Record<string, number>;
  extractionMethodUsage: Record<ExtractionMethod, number>;
  fieldAccuracy: Record<string, number>;
  errorsByType: Record<string, number>;
  performanceMetrics: PerformanceMetrics;
}

export interface PerformanceMetrics {
  avgTimePerRow: number;
  memoryUsagePeak: number;
  cpuUtilizationAvg: number;
  accuracyRate: number;
  ocrFallbackRate: number;
  errorRate: number;
}

// ==================== Error Types ====================

export interface ValidationError {
  type?: ErrorType;
  message: string;
  field?: string;
  code: string;
  severity?: string;
  timestamp?: Date;
  recoverable?: boolean;
  context?: Record<string, any>;
}

export type ErrorType = 
  | 'navigation'
  | 'extraction'
  | 'validation'
  | 'ocr'
  | 'configuration'
  | 'system'
  | 'timeout';

// ==================== System Types ====================

export interface SystemSettings {
  maxConcurrentRows: number;
  processingTimeout: number;
  memoryLimit: number;
  retryAttempts: number;
  logLevel: LogLevel;
  telemetryEnabled: boolean;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface PerformanceSettings {
  batchProcessing: boolean;
  batchSize: number;
  parallelWorkers: number;
  caching: CachingSettings;
  timeouts: TimeoutSettings;
}

export interface CachingSettings {
  domSnapshots: boolean;
  ocrResults: boolean;
  validationDecisions: boolean;
  ttl: number;
}

export interface TimeoutSettings {
  navigation: number;
  domExtraction: number;
  ocrProcessing: number;
  validationDecision: number;
  evidenceCollection: number;
}

export interface EvidenceSettings {
  retentionDays: number;
  retention?: number;
  screenshotEnabled: boolean;
  screenshots?: boolean;
  domSnapshotEnabled: boolean;
  domSnapshots?: boolean;
  compressionEnabled: boolean;
  compressionAfter?: number;
  includeInReports: boolean;
}

// ==================== Utility Types ====================

export interface CustomValidationRule {
  name: string;
  regex?: string;
  function?: string;
  params?: Record<string, any>;
  errorMessage: string;
}

export interface WhitespaceNormalization {
  trimLeading: boolean;
  trimTrailing: boolean;
  normalizeInternal: boolean;
}

export interface CaseNormalization {
  email?: 'lowercase' | 'uppercase' | 'preserve';
  name?: 'title_case' | 'lowercase' | 'uppercase' | 'preserve';
  text?: 'lowercase' | 'uppercase' | 'preserve';
  [key: string]: 'lowercase' | 'uppercase' | 'preserve' | 'title_case' | undefined;
}

export interface SpecialCharNormalization {
  removeAccents: boolean;
  normalizeQuotes: boolean;
  normalizeDashes: boolean;
}

export interface NumberNormalization {
  decimalSeparator: string;
  thousandSeparator: string;
  currencySymbolRemove: boolean;
}

export interface DateNormalization {
  targetFormat: string;
  inputFormats: string[];
}

export interface ValidationMetadata {
  version: string;
  timestamp: Date;
  processingNode: string;
  configurationHash: string;
  modelVersion: string;
}

export interface ReportMetadata {
  generatedBy: string;
  version: string;
  format: ReportFormat[];
  size: number;
  checksum?: string;
  configFile?: string;
  inputFile?: string;
}

export type ReportFormat = 'json' | 'html' | 'markdown' | 'csv';

// ==================== Event Types ====================

export interface ProcessingEvent {
  type: ProcessingEventType;
  rowId: string;
  timestamp: Date;
  data?: any;
  error?: ValidationError;
}

export type ProcessingEventType = 
  | 'row_started'
  | 'navigation_completed'
  | 'extraction_completed'
  | 'ocr_completed'
  | 'validation_completed'
  | 'evidence_collected'
  | 'row_completed'
  | 'error_occurred'
  | 'retry_attempted';

// ==================== CrewAI Integration Types ====================

export interface CrewTask {
  id: string;
  name: string;
  description: string;
  expectedOutput: string;
  agent: string;
  context: string[];
  tools: string[];
  inputs?: Record<string, any>;
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  result: any;
  executionTime: number;
  tokensUsed?: number;
  errors: string[];
}

export interface CrewExecution {
  id: string;
  timestamp: Date;
  inputs: Record<string, any>;
  agents: string[];
  tasks: CrewTask[];
  results: AgentResult[];
  totalExecutionTime: number;
  success: boolean;
}

// ==================== OCR Types ====================

export interface OCRSettings {
  language: string; // e.g., 'eng', 'por', 'eng+por'
  mode: number; // Page segmentation mode (1-13)
  whitelist?: string; // Character whitelist
  blacklist?: string; // Character blacklist
  imagePreprocessing: OCRPreprocessing;
  confidenceThreshold: number;
}

export interface OCRPreprocessing {
  enabled: boolean;
  operations: OCROperation[];
}

export type OCROperation = 
  | 'grayscale'
  | 'threshold'
  | 'blur'
  | 'sharpen'
  | 'deskew'
  | 'noise_reduction'
  | 'contrast_enhance';
