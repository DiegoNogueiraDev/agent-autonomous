import { Logger } from './logger.js';
import { CSVLoader } from './csv-loader.js';
import { ReportGenerator } from '../reporting/report-generator.js';
import { BrowserAgent } from '../automation/browser-agent.js';
import { LocalLLMEngine } from '../llm/local-llm-engine.js';
import { EvidenceCollector } from '../evidence/evidence-collector.js';
import type { 
  ValidationConfig, 
  CSVData, 
  Report, 
  ValidationResult,
  ReportSummary,
  ReportFormat,
  BrowserSettings,
  CSVRow,
  LLMSettings,
  EvidenceSettings
} from '../types/index.js';

export interface TaskmasterOptions {
  outputPath: string;
  reportFormats: ReportFormat[];
  progressCallback?: (processed: number, total: number) => void;
}

export class TaskmasterController {
  private logger: Logger;
  private csvLoader: CSVLoader;
  private reportGenerator: ReportGenerator;
  private browserAgent: BrowserAgent;
  private llmEngine: LocalLLMEngine;
  private evidenceCollector: EvidenceCollector;
  private config: ValidationConfig;

  constructor(config: ValidationConfig) {
    this.config = config;
    this.logger = Logger.getInstance();
    this.csvLoader = new CSVLoader();
    this.reportGenerator = new ReportGenerator();
    
    // Initialize browser agent with default settings
    const browserSettings: BrowserSettings = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      userAgent: 'DataHawk/1.0'
    };
    
    this.browserAgent = new BrowserAgent({ 
      settings: browserSettings,
      headless: true 
    });

    // Initialize LLM engine with default settings
    const llmSettings: LLMSettings = {
      modelPath: './models/mistral-7b-instruct-q4_k_m.gguf',
      contextSize: 4096,
      batchSize: 512,
      threads: 4,
      gpuLayers: 0,
      temperature: 0.1,
      maxTokens: 512
    };

    this.llmEngine = new LocalLLMEngine({ settings: llmSettings });

    // Initialize Evidence Collector (will be set with output path during execution)
    this.evidenceCollector = new EvidenceCollector({
      settings: this.config.evidence,
      baseOutputPath: './data/output' // Default, will be updated in execute()
    });
  }

  /**
   * Execute the complete validation pipeline
   */
  async execute(csvPath: string, options: TaskmasterOptions): Promise<Report> {
    const startTime = Date.now();
    this.logger.info('Starting DataHawk validation process', { csvPath, config: this.config.targetUrl });

    try {
      // 1. Load and validate CSV
      this.logger.info('Loading CSV file...');
      const csvData = await this.csvLoader.load(csvPath);
      this.logger.info(`CSV loaded successfully: ${csvData.rows.length} rows`, {
        headers: csvData.metadata.headers,
        delimiter: csvData.metadata.delimiter
      });

      // 2. Validate CSV structure
      const csvValidation = await this.csvLoader.validateRows(csvData.rows);
      if (!csvValidation.valid) {
        this.logger.warn('CSV validation warnings found', { 
          errors: csvValidation.errors.length,
          warnings: csvValidation.warnings.length 
        });
      }

      // 3. Initialize all components
      this.logger.info('Initializing browser agent...');
      await this.browserAgent.initialize();
      
      this.logger.info('Initializing LLM engine...');
      await this.llmEngine.initialize();

      this.logger.info('Initializing evidence collector...');
      // Update evidence collector with correct output path
      this.evidenceCollector = new EvidenceCollector({
        settings: this.config.evidence,
        baseOutputPath: options.outputPath
      });
      await this.evidenceCollector.initialize();

      // 4. Process rows with real browser automation
      const results: ValidationResult[] = [];
      const total = csvData.rows.length;

      try {
        for (let i = 0; i < csvData.rows.length; i++) {
          const row = csvData.rows[i];
          if (!row) continue;

          const rowStartTime = Date.now();
          const rowId = row.id?.toString() || `row_${i}`;

          this.logger.debug(`Processing row ${i + 1}/${total}`, { rowId });

          // Navigate to the target URL for this row
          const navigationResult = await this.browserAgent.navigateToUrl(
            this.config.targetUrl, 
            row as CSVRow
          );

          let webData: any = {
            domData: {},
            ocrData: {},
            screenshots: [],
            pageMetadata: {
              url: this.config.targetUrl,
              title: 'Navigation Failed',
              loadTime: navigationResult.loadTime,
              timestamp: new Date(),
              viewportSize: { width: 1920, height: 1080 },
              userAgent: 'DataHawk/1.0'
            },
            extractionMethods: {},
            extractionConfidence: {}
          };

          const errors: any[] = [];
          let overallMatch = false;
          let overallConfidence = 0;

          if (navigationResult.success) {
            try {
              // Extract data using field mappings
              webData = await this.browserAgent.extractWebData(this.config.fieldMappings);
              
              // Set basic success metrics - LLM validation will happen below
              overallMatch = true; // Will be updated by LLM validation
              overallConfidence = 0.8; // Will be updated by LLM validation

            } catch (extractionError) {
              this.logger.warn(`Data extraction failed for row ${rowId}`, extractionError);
              errors.push({
                type: 'extraction',
                message: extractionError instanceof Error ? extractionError.message : 'Extraction failed',
                field: undefined,
                code: 'EXTRACTION_ERROR',
                timestamp: new Date(),
                recoverable: true
              });
            }
          } else {
            this.logger.warn(`Navigation failed for row ${rowId}`, navigationResult.errors);
            errors.push({
              type: 'navigation',
              message: navigationResult.errors.join(', '),
              field: undefined,
              code: 'NAVIGATION_ERROR',
              timestamp: new Date(),
              recoverable: true
            });
          }

          const processingTime = Date.now() - rowStartTime;
          let fieldValidations: any[] = [];

          // If we have LLM decisions from extraction, use them
          if (navigationResult.success && webData.domData) {
            try {
              const validationRequests = this.config.fieldMappings.map(mapping => ({
                csvValue: row[mapping.csvField],
                webValue: webData.domData[mapping.csvField],
                fieldType: mapping.fieldType,
                fieldName: mapping.csvField
              }));

              const llmDecisions = await this.llmEngine.batchValidationDecisions(validationRequests);
              
              fieldValidations = this.config.fieldMappings.map((mapping, index) => {
                const decision = llmDecisions[index];
                return {
                  field: mapping.csvField,
                  csvValue: row[mapping.csvField],
                  webValue: webData.domData[mapping.csvField],
                  normalizedCsvValue: decision?.normalizedCsvValue || row[mapping.csvField],
                  normalizedWebValue: decision?.normalizedWebValue || webData.domData[mapping.csvField],
                  match: decision?.match || false,
                  confidence: decision?.confidence || 0,
                  method: webData.extractionMethods[mapping.csvField] || 'unknown',
                  reasoning: decision?.reasoning || 'No LLM decision available',
                  fuzzyScore: decision?.confidence || 0
                };
              });

              // Update overall match and confidence based on LLM decisions
              const matchingFields = fieldValidations.filter(v => v.match).length;
              const requiredFields = this.config.fieldMappings.filter(m => m.required).length;
              const requiredMatches = fieldValidations.filter(v => {
                const mapping = this.config.fieldMappings.find(m => m.csvField === v.field);
                return mapping?.required && v.match;
              }).length;

              // Must match all required fields to be considered valid
              overallMatch = requiredMatches === requiredFields && matchingFields > 0;
              overallConfidence = fieldValidations.reduce((sum, v) => sum + v.confidence, 0) / fieldValidations.length;
            } catch (llmError) {
              this.logger.warn(`LLM validation failed for row ${rowId}`, llmError);
            }
          }

          const result: ValidationResult = {
            rowId,
            csvData: row,
            webData,
            fieldValidations,
            overallMatch,
            overallConfidence,
            processingTime,
            evidenceId: `evidence_${i}`,
            errors,
            metadata: {
              version: '1.0.0',
              timestamp: new Date(),
              processingNode: 'local',
              configurationHash: 'abc123',
              modelVersion: 'llm-browser-agent-v1'
            }
          };

          // Collect evidence for this validation
          try {
            const evidence = await this.evidenceCollector.collectEvidence(result);
            // Update result with actual evidence ID
            result.evidenceId = evidence.id;
            
            this.logger.debug('Evidence collected', {
              rowId,
              evidenceId: evidence.id,
              filesCount: evidence.files.length
            });
          } catch (evidenceError) {
            this.logger.warn('Failed to collect evidence', {
              rowId,
              error: evidenceError instanceof Error ? evidenceError.message : 'Unknown error'
            });
          }

          results.push(result);

          // Report progress
          if (options.progressCallback) {
            options.progressCallback(i + 1, total);
          }

          this.logger.debug(`Row ${rowId} processed`, {
            match: overallMatch,
            confidence: overallConfidence,
            processingTime,
            evidenceId: result.evidenceId
          });
        }

      } finally {
        // Always close browser and LLM engine
        await this.browserAgent.close();
        await this.llmEngine.close();
        this.logger.info('Browser agent and LLM engine closed');
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // 4. Generate report
      const summary: ReportSummary = {
        totalRows: csvData.rows.length,
        processedRows: results.length,
        successfulValidations: results.filter(r => r.overallMatch).length,
        failedValidations: results.filter(r => !r.overallMatch).length,
        averageConfidence: results.reduce((sum, r) => sum + r.overallConfidence, 0) / results.length,
        processingTime,
        errorRate: results.filter(r => r.errors.length > 0).length / results.length
      };

      const report: Report = {
        id: `report_${Date.now()}`,
        timestamp: new Date(),
        summary,
        results,
        statistics: {
          confidenceDistribution: this.calculateConfidenceDistribution(results),
          extractionMethodUsage: { dom: results.length, ocr: 0, fuzzy: 0, manual: 0 },
          fieldAccuracy: {},
          errorsByType: {},
          performanceMetrics: {
            avgTimePerRow: processingTime / results.length,
            memoryUsagePeak: process.memoryUsage().heapUsed / 1024 / 1024, // MB
            cpuUtilizationAvg: 0, // Stub
            accuracyRate: summary.successfulValidations / summary.processedRows,
            ocrFallbackRate: 0, // Stub
            errorRate: summary.errorRate
          }
        },
        configuration: this.config,
        metadata: {
          generatedBy: 'DataHawk v1.0.0',
          version: '1.0.0',
          format: options.reportFormats,
          size: 0, // Will be calculated when saved
          checksum: undefined
        }
      };

      this.logger.info('Validation completed successfully', {
        totalRows: summary.totalRows,
        successRate: summary.successfulValidations / summary.processedRows,
        processingTime: processingTime
      });

      // 5. Generate and save reports
      const generatedFiles = await this.reportGenerator.generateReports(
        report, 
        options.outputPath, 
        options.reportFormats
      );

      this.logger.info(`Reports generated successfully`, {
        files: generatedFiles,
        formats: options.reportFormats
      });

      return report;

    } catch (error) {
      this.logger.error('Validation process failed', error);
      throw error;
    }
  }

  /**
   * Calculate confidence distribution for statistics
   */
  private calculateConfidenceDistribution(results: ValidationResult[]): Record<string, number> {
    const distribution: Record<string, number> = {
      'high (0.9-1.0)': 0,
      'medium (0.7-0.9)': 0,
      'low (0.5-0.7)': 0,
      'very_low (0-0.5)': 0
    };

    for (const result of results) {
      const confidence = result.overallConfidence;
      if (confidence >= 0.9) {
        distribution['high (0.9-1.0)'] = (distribution['high (0.9-1.0)'] || 0) + 1;
      } else if (confidence >= 0.7) {
        distribution['medium (0.7-0.9)'] = (distribution['medium (0.7-0.9)'] || 0) + 1;
      } else if (confidence >= 0.5) {
        distribution['low (0.5-0.7)'] = (distribution['low (0.5-0.7)'] || 0) + 1;
      } else {
        distribution['very_low (0-0.5)'] = (distribution['very_low (0-0.5)'] || 0) + 1;
      }
    }

    return distribution;
  }

  /**
   * Simple value comparison for validation (stub implementation)
   */
  private compareValues(csvValue: any, webValue: any): boolean {
    if (csvValue === null || csvValue === undefined) return false;
    if (webValue === null || webValue === undefined) return false;
    
    // Convert both to strings and normalize
    const csvStr = String(csvValue).toLowerCase().trim();
    const webStr = String(webValue).toLowerCase().trim();
    
    // Direct match
    if (csvStr === webStr) return true;
    
    // Partial match for longer strings
    if (csvStr.length > 3 && webStr.includes(csvStr)) return true;
    if (webStr.length > 3 && csvStr.includes(webStr)) return true;
    
    return false;
  }
}