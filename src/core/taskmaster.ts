import { Logger } from './logger.js';
import { CSVLoader } from './csv-loader.js';
import { ReportGenerator } from '../reporting/report-generator.js';
import { BrowserAgent } from '../automation/browser-agent.js';
import { LocalLLMEngine } from '../llm/local-llm-engine.js';
import { EvidenceCollector } from '../evidence/evidence-collector.js';
import { CrewOrchestrator } from '../agents/crew-orchestrator.js';
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
  EvidenceSettings,
  CrewConfig,
  OCRSettings
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
  private crewOrchestrator: CrewOrchestrator;
  private config: ValidationConfig | null = null;

  constructor(config?: ValidationConfig) {
    this.config = config || null;
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

    // Initialize Evidence Collector with default settings if no config provided
    const evidenceSettings: EvidenceSettings = this.config?.evidence || {
      retentionDays: 30,
      retention: 30,
      screenshotEnabled: true,
      screenshots: true,
      domSnapshotEnabled: true,
      domSnapshots: true,
      compressionEnabled: true,
      compressionAfter: 7,
      includeInReports: true
    };
    
    this.evidenceCollector = new EvidenceCollector({
      settings: evidenceSettings,
      baseOutputPath: './data/output' // Default, will be updated in execute()
    });

    // Initialize CrewAI Orchestrator
    const crewConfig: CrewConfig = {
      maxConcurrentTasks: 4,
      taskTimeout: 30000,
      retryAttempts: 2,
      agentHealthCheck: true,
      performanceMonitoring: true
    };
    this.crewOrchestrator = new CrewOrchestrator(crewConfig);
  }

  /**
   * Validate data from CSV against web interface
   */
  async validateData(options: {
    inputPath: string;
    configPath: string;
    outputPath: string;
    formats: ReportFormat[];
    maxRows?: number;
    onProgress?: (progress: number) => void;
  }): Promise<Report> {
    try {
      // Load configuration
      const { ConfigManager } = await import('./config-manager.js');
      const configManager = new ConfigManager();
      const config = await configManager.loadValidationConfig(options.configPath);
      
      // Load CSV data
      const csvData = await this.csvLoader.load(options.inputPath);
      let rows = csvData.rows;
      
      // Apply row limit if specified
      if (options.maxRows && options.maxRows > 0) {
        rows = rows.slice(0, options.maxRows);
      }

      // Initialize engines
      await this.browserAgent.initialize();
      await this.llmEngine.initialize();
      
      // Initialize CrewAI orchestrator with engines
      await this.crewOrchestrator.initialize(
        this.browserAgent,
        this.llmEngine,
        undefined, // OCR Engine - will be created internally
        this.evidenceCollector
      );

      const startTime = Date.now();
      const results: ValidationResult[] = [];
      let successfulValidations = 0;
      let totalConfidence = 0;
      let errorCount = 0;

      this.logger.info('Starting validation process', {
        totalRows: rows.length,
        targetUrl: config.targetUrl,
        fieldMappings: config.fieldMappings.length
      });

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const csvRow = { ...rows[i], _index: i };
        
        try {
          if (options.onProgress) {
            options.onProgress(Math.round((i / rows.length) * 100));
          }

          // Use CrewAI multi-agent orchestration
          const crewResult = await this.crewOrchestrator.executeRowValidation(
            csvRow,
            config.fieldMappings,
            config
          );

          if (crewResult.success && crewResult.validationResults) {
            // Convert crew result to standard validation result
            const validations = crewResult.validationResults.validationResults || crewResult.validationResults;
            const webData = crewResult.extractionResults?.extractedData || {};

            const fieldValidations: FieldValidation[] = Array.isArray(validations) ? validations.map((v: any) => ({
              field: config.fieldMappings.find(m => m.csvField in csvRow)?.csvField || 'unknown',
              csvValue: csvRow[v.field] || null,
              webValue: v.webValue || null,
              normalizedCsvValue: csvRow[v.field] || null,
              normalizedWebValue: v.webValue || null,
              match: v.match || false,
              confidence: v.confidence || 0,
              method: v.method || 'crew_ai',
              reasoning: v.reasoning || 'Validated by CrewAI multi-agent system'
            })) : [];

            const validationResult: ValidationResult = {
              rowId: `row-${i}`,
              rowIndex: i,
              csvData: csvRow,
              webData,
              fieldValidations,
              validations: fieldValidations,
              overallMatch: fieldValidations.some(v => v.match),
              overallConfidence: fieldValidations.length > 0 
                ? fieldValidations.reduce((sum, v) => sum + v.confidence, 0) / fieldValidations.length 
                : 0,
              processingTime: crewResult.processingTime || 0,
              evidenceId: `evidence-${i}`,
              errors: [],
              metadata: {
                version: '1.1.0',
                timestamp: new Date(),
                processingNode: 'main',
                configurationHash: '',
                modelVersion: ''
              },
              timestamp: new Date().toISOString()
            };

            results.push(validationResult);

            // Calculate metrics
            const avgConfidence = validationResult.validations?.length > 0
              ? validationResult.validations.reduce((sum, v) => sum + v.confidence, 0) / validationResult.validations.length
              : 0;

            totalConfidence += avgConfidence;
            
            if (validationResult.validations?.some(v => v.match)) {
              successfulValidations++;
            }
          } else {
            errorCount++;
            
            // Add error result
            const webData: ExtractedWebData = {
              domData: {},
              ocrData: {},
              screenshots: [],
              pageMetadata: {
                url: '',
                title: '',
                loadTime: 0,
                timestamp: new Date(),
                viewportSize: { width: 0, height: 0 },
                userAgent: ''
              },
              extractionMethods: {},
              extractionConfidence: {}
            };

            const errorResult: ValidationResult = {
              rowId: `row-${i}`,
              rowIndex: i,
              csvData: csvRow,
              webData,
              fieldValidations: [],
              validations: [],
              overallMatch: false,
              overallConfidence: 0,
              processingTime: crewResult.processingTime || 0,
              evidenceId: `error-${i}`,
              errors: [{ message: crewResult.error || 'Validation failed', code: 'VALIDATION_ERROR', field: '', severity: 'error' }],
              metadata: {
                version: '1.1.0',
                timestamp: new Date(),
                processingNode: 'main',
                configurationHash: '',
                modelVersion: ''
              },
              timestamp: new Date().toISOString()
            };

            results.push(errorResult);
          }
        } catch (error) {
          errorCount++;
          this.logger.error('Row validation failed', { rowIndex: i, error });
          
          const errorResult: ValidationResult = {
            rowIndex: i,
            csvData: csvRow,
            webData: {},
            validations: [],
            processingTime: 0,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          };

          results.push(errorResult);
        }
      }

      if (options.onProgress) {
        options.onProgress(100);
      }

      const processingTime = Date.now() - startTime;
      const averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;
      const errorRate = results.length > 0 ? errorCount / results.length : 0;

      // Create summary
      const summary: ReportSummary = {
        totalRows: results.length,
        processedRows: results.length,
        successfulValidations,
        averageConfidence,
        processingTime,
        errorRate,
        performance: {
          totalTasks: results.length,
          averageTaskTime: results.length > 0 ? processingTime / results.length : 0,
          successRate: results.length > 0 ? successfulValidations / results.length : 0,
          rowsPerSecond: processingTime > 0 ? (results.length / (processingTime / 1000)) : 0,
          averageRowTime: results.length > 0 ? processingTime / results.length : 0
        },
        failedValidations: errorCount
      };

      // Create final report object
      const report: Report = {
        summary,
        results,
        statistics: {
          totalRows: results.length,
          validRows: results.filter(r => r.errors.length === 0).length,
          confidenceDistribution: {},
          extractionMethodUsage: {},
          fieldAccuracy: {},
          errorsByType: {},
          performanceMetrics: {
            avgTimePerRow: results.length > 0 ? processingTime / results.length : 0,
            memoryUsagePeak: 0,
            cpuUtilizationAvg: 0,
            accuracyRate: successfulValidations / Math.max(results.length, 1),
            ocrFallbackRate: 0,
            errorRate
          }
        },
        timestamp: new Date(),
        version: '1.1.0',
        configuration: this.config!,
        metadata: {
          generatedBy: 'DataHawk Taskmaster',
          version: '1.1.0',
          format: options.formats,
          size: 0,
          inputFile: options.inputPath,
          configFile: options.configPath
        }
      };

      // Generate reports
      const reportPaths = await this.reportGenerator.generateReports(
        report,
        options.outputPath,
        options.formats
      );

      return {
        summary,
        results,
        metadata: {
          configFile: options.configPath,
          inputFile: options.inputPath,
          timestamp: new Date().toISOString(),
          processingTime,
          version: '1.1.0'
        },
        reportPaths
      };

    } catch (error) {
      this.logger.error('Validation process failed', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.browserAgent && typeof this.browserAgent.cleanup === 'function') {
      await this.browserAgent.cleanup();
    }
    
    if (this.llmEngine && typeof (this.llmEngine as any).cleanup === 'function') {
      await (this.llmEngine as any).cleanup();
    }

    if (this.crewOrchestrator && typeof this.crewOrchestrator.cleanup === 'function') {
      await this.crewOrchestrator.cleanup();
    }
  }

  /**
   * Execute the complete validation pipeline
   */
  async execute(csvPath: string, options: TaskmasterOptions): Promise<Report> {
    const startTime = Date.now();
    this.logger.info('Starting DataHawk validation process', { csvPath, config: this.config?.targetUrl });

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
        settings: this.config?.evidence || {
          retentionDays: 30,
          screenshotEnabled: true,
          domSnapshotEnabled: true,
          compressionEnabled: false,
          includeInReports: true
        },
        baseOutputPath: options.outputPath
      });
      await this.evidenceCollector.initialize();

      this.logger.info('Initializing CrewAI orchestrator...');
      // Create a temporary OCR engine for CrewAI
      const { OCREngine } = await import('../ocr/ocr-engine.js');
      const tempOcrEngine = new OCREngine({ 
        settings: { language: 'eng+por', mode: 6, confidenceThreshold: 0.7, imagePreprocessing: { enabled: true, operations: ['grayscale', 'contrast_enhance'] } } 
      });
      await tempOcrEngine.initialize();
      
      await this.crewOrchestrator.initialize(
        this.browserAgent,
        this.llmEngine,
        tempOcrEngine,
        this.evidenceCollector
      );

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

          // Use CrewAI multi-agent orchestration for validation
          const crewResult = await this.crewOrchestrator.executeRowValidation(
            row as CSVRow,
            this.config?.fieldMappings || [],
            this.config!
          );

          // Extract results from CrewAI orchestration
          const navigationResult = crewResult.navigationResult || {
            success: false,
            url: this.config?.targetUrl || '',
            loadTime: 0,
            errors: ['CrewAI navigation failed'],
            redirects: [],
            finalUrl: this.config?.targetUrl || ''
          };

          let webData: any = crewResult.extractionResults || {
            domData: {},
            ocrData: {},
            screenshots: [],
            pageMetadata: {
              url: this.config?.targetUrl || '',
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
          let overallMatch = crewResult.success || false;
          let overallConfidence = 0;

          if (!crewResult.success) {
            this.logger.warn(`CrewAI validation failed for row ${rowId}`, crewResult.error);
            errors.push({
              type: 'crew_validation',
              message: crewResult.error || 'Multi-agent validation failed',
              field: undefined,
              code: 'CREW_ERROR',
              timestamp: new Date(),
              recoverable: true
            });
          }

          const processingTime = Date.now() - rowStartTime;
          let fieldValidations: any[] = [];

          // Use validation results from CrewAI if available
          if (crewResult.validationResults && Array.isArray(crewResult.validationResults)) {
            fieldValidations = this.config.fieldMappings.map((mapping, index) => {
              const decision = crewResult.validationResults[index];
              return {
                field: mapping.csvField,
                csvValue: row[mapping.csvField],
                webValue: webData.domData?.[mapping.csvField],
                normalizedCsvValue: decision?.normalizedCsvValue || row[mapping.csvField],
                normalizedWebValue: decision?.normalizedWebValue || webData.domData?.[mapping.csvField],
                match: decision?.match || false,
                confidence: decision?.confidence || 0,
                method: webData.extractionMethods?.[mapping.csvField] || 'crew_ai',
                reasoning: decision?.reasoning || 'CrewAI multi-agent validation',
                fuzzyScore: decision?.confidence || 0
              };
            });

            // Calculate overall metrics from CrewAI results
            const matchingFields = fieldValidations.filter(v => v.match).length;
            const requiredFields = this.config.fieldMappings.filter(m => m.required).length;
            const requiredMatches = fieldValidations.filter(v => {
              const mapping = this.config.fieldMappings.find(m => m.csvField === v.field);
              return mapping?.required && v.match;
            }).length;

            overallMatch = requiredMatches === requiredFields && matchingFields > 0;
            overallConfidence = fieldValidations.reduce((sum, v) => sum + v.confidence, 0) / fieldValidations.length;
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

          // Use evidence from CrewAI or collect new evidence
          try {
            if (crewResult.evidenceResult?.evidenceId) {
              result.evidenceId = crewResult.evidenceResult.evidenceId;
              this.logger.debug('Evidence from CrewAI', {
                rowId,
                evidenceId: result.evidenceId
              });
            } else {
              const evidence = await this.evidenceCollector.collectEvidence(result);
              result.evidenceId = evidence.id;
              this.logger.debug('Evidence collected', {
                rowId,
                evidenceId: evidence.id,
                filesCount: evidence.files.length
              });
            }
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
        // Always close browser, LLM engine, and CrewAI orchestrator
        await this.browserAgent.close();
        await this.llmEngine.close();
        await this.crewOrchestrator.shutdown();
        this.logger.info('Browser agent, LLM engine, and CrewAI orchestrator closed');
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