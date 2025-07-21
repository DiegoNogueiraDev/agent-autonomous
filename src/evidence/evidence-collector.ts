import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { Logger } from '../core/logger.js';
import type { 
  Evidence, 
  EvidenceFile, 
  EvidenceMetadata,
  ValidationResult,
  Screenshot,
  ExtractedWebData,
  EvidenceSettings
} from '../types/index.js';

export interface EvidenceCollectorOptions {
  settings: EvidenceSettings;
  baseOutputPath: string;
}

/**
 * Evidence Collector for storing validation evidence
 */
export class EvidenceCollector {
  private logger: Logger;
  private settings: EvidenceSettings;
  private baseOutputPath: string;
  private evidenceCount: number = 0;
  private initialized: boolean = false;

  constructor(options: EvidenceCollectorOptions) {
    this.logger = Logger.getInstance();
    this.settings = options.settings;
    this.baseOutputPath = join(options.baseOutputPath, 'evidence');
  }

  /**
   * Initialize evidence collector
   */
  async initialize(): Promise<void> {
    try {
      // Create evidence directory structure
      await mkdir(this.baseOutputPath, { recursive: true });
      await mkdir(join(this.baseOutputPath, 'screenshots'), { recursive: true });
      await mkdir(join(this.baseOutputPath, 'dom-snapshots'), { recursive: true });
      await mkdir(join(this.baseOutputPath, 'data'), { recursive: true });
      await mkdir(join(this.baseOutputPath, 'logs'), { recursive: true });

      this.initialized = true;
      this.logger.info('Evidence collector initialized', {
        basePath: this.baseOutputPath,
        screenshotsEnabled: this.settings.screenshotEnabled,
        domSnapshotsEnabled: this.settings.domSnapshotEnabled
      });

    } catch (error) {
      this.logger.error('Failed to initialize evidence collector', error);
      throw error;
    }
  }

  /**
   * Check if evidence collector is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Collect evidence for a validation result
   */
  async collectEvidence(validationResult: ValidationResult): Promise<Evidence> {
    const evidenceId = this.generateEvidenceId(validationResult.rowId);
    const timestamp = new Date();

    try {
      this.logger.debug('Collecting evidence', {
        evidenceId,
        rowId: validationResult.rowId
      });

      const files: EvidenceFile[] = [];

      // Save screenshots if enabled
      let screenshots: Screenshot[] = [];
      if (this.settings.screenshotEnabled && validationResult.webData.screenshots) {
        screenshots = await this.saveScreenshots(
          validationResult.webData.screenshots,
          evidenceId
        );
        
        // Add screenshot files to evidence files list
        files.push(...screenshots.map(screenshot => ({
          path: join('screenshots', `${evidenceId}_${screenshot.id}.png`),
          type: 'screenshot' as const,
          size: screenshot.base64Data.length,
          checksum: this.calculateChecksum(screenshot.base64Data),
          compressed: this.settings.compressionEnabled
        })));
      }

      // Save DOM snapshot if enabled
      let domSnapshot = '';
      if (this.settings.domSnapshotEnabled) {
        domSnapshot = await this.saveDomSnapshot(
          validationResult.webData,
          evidenceId
        );

        files.push({
          path: join('dom-snapshots', `${evidenceId}_dom.html`),
          type: 'dom',
          size: domSnapshot.length,
          checksum: this.calculateChecksum(domSnapshot),
          compressed: this.settings.compressionEnabled
        });
      }

      // Save extracted data
      const dataSnapshot = await this.saveDataSnapshot(validationResult, evidenceId);
      files.push({
        path: join('data', `${evidenceId}_data.json`),
        type: 'data',
        size: dataSnapshot.length,
        checksum: this.calculateChecksum(dataSnapshot),
        compressed: false
      });

      // Save validation log
      const logSnapshot = await this.saveValidationLog(validationResult, evidenceId);
      files.push({
        path: join('logs', `${evidenceId}_validation.log`),
        type: 'log',
        size: logSnapshot.length,
        checksum: this.calculateChecksum(logSnapshot),
        compressed: false
      });

      // Create evidence metadata
      const metadata: EvidenceMetadata = {
        version: '1.0.0',
        retentionDate: new Date(Date.now() + this.settings.retentionDays * 24 * 60 * 60 * 1000),
        compressionRatio: this.settings.compressionEnabled ? 0.7 : 1.0,
        indexKey: this.generateIndexKey(validationResult)
      };

      const evidence: Evidence = {
        id: evidenceId,
        rowId: validationResult.rowId,
        timestamp,
        screenshots,
        domSnapshot,
        extractedData: validationResult.webData,
        validationResult,
        metadata,
        files
      };

      // Save evidence index
      await this.saveEvidenceIndex(evidence);

      this.evidenceCount++;

      this.logger.info('Evidence collected successfully', {
        evidenceId,
        filesCount: files.length,
        screenshotsCount: screenshots.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0)
      });

      return evidence;

    } catch (error) {
      this.logger.error('Failed to collect evidence', {
        evidenceId,
        rowId: validationResult.rowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Save screenshots to disk
   */
  private async saveScreenshots(
    screenshots: Screenshot[],
    evidenceId: string
  ): Promise<Screenshot[]> {
    const savedScreenshots: Screenshot[] = [];

    for (const screenshot of screenshots) {
      try {
        const fileName = `${evidenceId}_${screenshot.id}.png`;
        const filePath = join(this.baseOutputPath, 'screenshots', fileName);

        // Convert base64 to buffer and save
        const buffer = Buffer.from(screenshot.base64Data, 'base64');
        await writeFile(filePath, buffer);

        // Update screenshot with file path
        savedScreenshots.push({
          ...screenshot,
          base64Data: this.settings.compressionEnabled ? '' : screenshot.base64Data // Clear if compressed
        });

        this.logger.debug('Screenshot saved', {
          fileName,
          size: buffer.length
        });

      } catch (error) {
        this.logger.warn('Failed to save screenshot', {
          screenshotId: screenshot.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return savedScreenshots;
  }

  /**
   * Save DOM snapshot to disk
   */
  private async saveDomSnapshot(
    webData: ExtractedWebData,
    evidenceId: string
  ): Promise<string> {
    const fileName = `${evidenceId}_dom.html`;
    const filePath = join(this.baseOutputPath, 'dom-snapshots', fileName);

    // Create a simple HTML snapshot
    const domSnapshot = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>DOM Snapshot - Evidence ${evidenceId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .evidence-header { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .extraction-data { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .page-metadata { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="evidence-header">
        <h1>DOM Snapshot Evidence</h1>
        <p><strong>Evidence ID:</strong> ${evidenceId}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Page URL:</strong> ${webData.pageMetadata.url}</p>
        <p><strong>Page Title:</strong> ${webData.pageMetadata.title}</p>
    </div>

    <div class="page-metadata">
        <h2>Page Metadata</h2>
        <pre>${JSON.stringify(webData.pageMetadata, null, 2)}</pre>
    </div>

    <div class="extraction-data">
        <h2>Extracted DOM Data</h2>
        <pre>${JSON.stringify(webData.domData, null, 2)}</pre>
    </div>

    <div class="extraction-data">
        <h2>Extraction Methods</h2>
        <pre>${JSON.stringify(webData.extractionMethods, null, 2)}</pre>
    </div>

    <div class="extraction-data">
        <h2>Extraction Confidence</h2>
        <pre>${JSON.stringify(webData.extractionConfidence, null, 2)}</pre>
    </div>
</body>
</html>`;

    await writeFile(filePath, domSnapshot, 'utf-8');

    this.logger.debug('DOM snapshot saved', {
      fileName,
      size: domSnapshot.length
    });

    return domSnapshot;
  }

  /**
   * Save extracted data as JSON
   */
  private async saveDataSnapshot(
    validationResult: ValidationResult,
    evidenceId: string
  ): Promise<string> {
    const fileName = `${evidenceId}_data.json`;
    const filePath = join(this.baseOutputPath, 'data', fileName);

    const dataSnapshot = {
      evidenceId,
      rowId: validationResult.rowId,
      timestamp: new Date().toISOString(),
      csvData: validationResult.csvData,
      extractedWebData: validationResult.webData.domData,
      fieldValidations: validationResult.fieldValidations,
      overallMatch: validationResult.overallMatch,
      overallConfidence: validationResult.overallConfidence,
      processingTime: validationResult.processingTime,
      errors: validationResult.errors
    };

    const jsonContent = JSON.stringify(dataSnapshot, null, 2);
    await writeFile(filePath, jsonContent, 'utf-8');

    this.logger.debug('Data snapshot saved', {
      fileName,
      size: jsonContent.length
    });

    return jsonContent;
  }

  /**
   * Save validation log
   */
  private async saveValidationLog(
    validationResult: ValidationResult,
    evidenceId: string
  ): Promise<string> {
    const fileName = `${evidenceId}_validation.log`;
    const filePath = join(this.baseOutputPath, 'logs', fileName);

    const logEntries = [
      `=== VALIDATION LOG - Evidence ${evidenceId} ===`,
      `Timestamp: ${new Date().toISOString()}`,
      `Row ID: ${validationResult.rowId}`,
      `Overall Match: ${validationResult.overallMatch}`,
      `Overall Confidence: ${(validationResult.overallConfidence * 100).toFixed(2)}%`,
      `Processing Time: ${validationResult.processingTime}ms`,
      '',
      '=== FIELD VALIDATIONS ===',
      ...validationResult.fieldValidations.map(fv => 
        `Field: ${fv.field} | CSV: "${fv.csvValue}" | Web: "${fv.webValue}" | Match: ${fv.match} | Confidence: ${(fv.confidence * 100).toFixed(2)}% | Reasoning: ${fv.reasoning}`
      ),
      '',
      '=== ERRORS ===',
      ...validationResult.errors.map(error => 
        `[${error.type}] ${error.message} (Code: ${error.code})`
      ),
      '',
      '=== METADATA ===',
      `Version: ${validationResult.metadata.version}`,
      `Processing Node: ${validationResult.metadata.processingNode}`,
      `Model Version: ${validationResult.metadata.modelVersion}`,
      '========================'
    ];

    const logContent = logEntries.join('\n');
    await writeFile(filePath, logContent, 'utf-8');

    this.logger.debug('Validation log saved', {
      fileName,
      size: logContent.length
    });

    return logContent;
  }

  /**
   * Save evidence index for searchability
   */
  private async saveEvidenceIndex(evidence: Evidence): Promise<void> {
    const indexFileName = `evidence_index.json`;
    const indexFilePath = join(this.baseOutputPath, indexFileName);

    try {
      // Try to read existing index
      let existingIndex: any[] = [];
      try {
        const { readFile } = await import('fs/promises');
        const existingContent = await readFile(indexFilePath, 'utf-8');
        existingIndex = JSON.parse(existingContent);
      } catch {
        // Index doesn't exist yet, start with empty array
      }

      // Add new evidence entry
      const indexEntry = {
        id: evidence.id,
        rowId: evidence.rowId,
        timestamp: evidence.timestamp.toISOString(),
        overallMatch: evidence.validationResult.overallMatch,
        overallConfidence: evidence.validationResult.overallConfidence,
        filesCount: evidence.files.length,
        indexKey: evidence.metadata.indexKey,
        retentionDate: evidence.metadata.retentionDate.toISOString()
      };

      existingIndex.push(indexEntry);

      // Save updated index
      await writeFile(indexFilePath, JSON.stringify(existingIndex, null, 2), 'utf-8');

    } catch (error) {
      this.logger.warn('Failed to update evidence index', error);
    }
  }

  /**
   * Generate unique evidence ID
   */
  private generateEvidenceId(rowId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ev_${rowId}_${timestamp}_${random}`;
  }

  /**
   * Generate index key for searchability
   */
  private generateIndexKey(validationResult: ValidationResult): string {
    const keyParts = [
      validationResult.rowId,
      validationResult.overallMatch ? 'match' : 'nomatch',
      Math.round(validationResult.overallConfidence * 10).toString(),
      validationResult.errors.length > 0 ? 'errors' : 'clean'
    ];
    return keyParts.join('_');
  }

  /**
   * Calculate checksum for file integrity
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get evidence collector statistics
   */
  getStatistics() {
    return {
      evidenceCount: this.evidenceCount,
      baseOutputPath: this.baseOutputPath,
      settings: this.settings
    };
  }

  /**
   * Cleanup old evidence based on retention policy
   */
  async cleanupOldEvidence(): Promise<number> {
    // TODO: Implement cleanup based on retention days
    this.logger.info('Evidence cleanup not yet implemented');
    return 0;
  }
}