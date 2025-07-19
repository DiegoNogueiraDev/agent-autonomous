import { readFile, stat } from 'fs/promises';
import Papa from 'papaparse';
import { z } from 'zod';
import type { 
  CSVData, 
  CSVRow, 
  CSVMetadata, 
  ValidationResult,
  ValidationError 
} from '../types/index.js';

// Validation schemas
const EmailSchema = z.string().email().optional().or(z.literal(''));
const RequiredStringSchema = z.string().min(1, 'Field is required');
const OptionalStringSchema = z.string().optional();

export interface CSVConfig {
  delimiter?: string;
  headers?: boolean;
  maxRows?: number;
  skipEmptyLines?: boolean;
  trimHeaders?: boolean;
  encoding?: BufferEncoding;
}

export interface CSVValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  rowsProcessed: number;
}

export class CSVLoader {
  private defaultConfig: Required<CSVConfig> = {
    delimiter: 'auto',
    headers: true,
    maxRows: 50000,
    skipEmptyLines: true,
    trimHeaders: true,
    encoding: 'utf-8'
  };

  /**
   * Detect the delimiter used in a CSV sample
   */
  detectDelimiter(sample: string): string {
    const delimiters = [',', ';', '|', '\t'];
    const lines = sample.split('\n').slice(0, 5); // Check first 5 lines
    
    let maxScore = 0;
    let bestDelimiter = ',';

    for (const delimiter of delimiters) {
      let score = 0;
      let consistency = 0;
      let prevCount = -1;

      for (const line of lines) {
        if (line.trim()) {
          const count = (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
          score += count;

          // Check consistency across lines
          if (prevCount === -1) {
            prevCount = count;
            consistency = 1;
          } else if (prevCount === count && count > 0) {
            consistency++;
          }
        }
      }

      // Prefer delimiters with higher count and better consistency
      const finalScore = score * consistency;
      if (finalScore > maxScore) {
        maxScore = finalScore;
        bestDelimiter = delimiter;
      }
    }

    return bestDelimiter;
  }

  /**
   * Load and parse CSV file
   */
  async load(filePath: string, config?: CSVConfig): Promise<CSVData> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    
    try {
      // Read file and get metadata
      const [fileContent, fileStats] = await Promise.all([
        readFile(filePath, mergedConfig.encoding),
        stat(filePath)
      ]);

      // Auto-detect delimiter if needed
      const delimiter = mergedConfig.delimiter === 'auto' 
        ? this.detectDelimiter(fileContent)
        : mergedConfig.delimiter;

      // Parse CSV
      const parseResult = Papa.parse<CSVRow>(fileContent, {
        delimiter,
        header: mergedConfig.headers,
        skipEmptyLines: mergedConfig.skipEmptyLines,
        transformHeader: mergedConfig.trimHeaders 
          ? (header: string) => header.trim().toLowerCase()
          : undefined,
        transform: (value: string) => value.trim(),
        dynamicTyping: false // Keep everything as strings for consistency
      });

      if (parseResult.errors.length > 0) {
        const criticalErrors = parseResult.errors.filter(error => 
          error.type === 'Delimiter' || error.type === 'FieldMismatch'
        );
        
        if (criticalErrors.length > 0) {
          throw new Error(`CSV parsing failed: ${criticalErrors[0]?.message}`);
        }
      }

      // Filter and limit rows
      let rows = parseResult.data.filter(row => 
        Object.values(row).some(value => value && value.toString().trim())
      );

      if (mergedConfig.maxRows && rows.length > mergedConfig.maxRows) {
        rows = rows.slice(0, mergedConfig.maxRows);
      }

      // Extract headers
      const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];

      // Create metadata
      const metadata: CSVMetadata = {
        totalRows: rows.length,
        delimiter,
        headers,
        loadedAt: new Date(),
        filePath,
        fileSize: fileStats.size
      };

      return {
        rows,
        metadata
      };

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load CSV file: ${error.message}`);
      }
      throw new Error('Failed to load CSV file: Unknown error');
    }
  }

  /**
   * Validate CSV rows against basic rules
   */
  async validateRows(rows: CSVRow[]): Promise<CSVValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let rowsProcessed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      rowsProcessed++;

      try {
        // Basic validation rules
        await this.validateRow(row, i + 1, errors);
      } catch (error) {
        errors.push({
          type: 'validation',
          message: `Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
          field: 'unknown',
          code: 'VALIDATION_ERROR',
          timestamp: new Date(),
          recoverable: true,
          context: { rowIndex: i, row }
        });
      }
    }

    // Check for common issues
    if (rows.length === 0) {
      warnings.push('No data rows found in CSV');
    }

    const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];
    if (headers.length === 1) {
      warnings.push('Only one column detected - delimiter might be incorrect');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      rowsProcessed
    };
  }

  /**
   * Validate individual row
   */
  private async validateRow(row: CSVRow, rowNumber: number, errors: ValidationError[]): Promise<void> {
    const requiredFields = ['id']; // Basic required fields
    const emailFields = ['email', 'email_address', 'e_mail'];

    // Check required fields
    for (const field of requiredFields) {
      if (field in row) {
        const value = row[field];
        if (!value || value.toString().trim() === '') {
          errors.push({
            type: 'validation',
            message: `Required field '${field}' is empty`,
            field,
            code: 'REQUIRED_FIELD_EMPTY',
            timestamp: new Date(),
            recoverable: false,
            context: { rowNumber, value }
          });
        }
      }
    }

    // Validate email fields
    for (const field of emailFields) {
      if (field in row) {
        const value = row[field];
        if (value && value.toString().trim()) {
          try {
            EmailSchema.parse(value);
          } catch {
            errors.push({
              type: 'validation',
              message: `Invalid email format in field '${field}': ${value}`,
              field,
              code: 'INVALID_EMAIL_FORMAT',
              timestamp: new Date(),
              recoverable: true,
              context: { rowNumber, value }
            });
          }
        }
      }
    }

    // Check for suspiciously long fields (potential data corruption)
    for (const [field, value] of Object.entries(row)) {
      if (value && value.toString().length > 1000) {
        errors.push({
          type: 'validation',
          message: `Field '${field}' is suspiciously long (${value.toString().length} characters)`,
          field,
          code: 'FIELD_TOO_LONG',
          timestamp: new Date(),
          recoverable: true,
          context: { rowNumber, length: value.toString().length }
        });
      }
    }
  }

  /**
   * Get CSV statistics
   */
  getStatistics(data: CSVData): Record<string, any> {
    const { rows, metadata } = data;
    
    if (rows.length === 0) {
      return {
        totalRows: 0,
        totalColumns: 0,
        emptyFields: 0,
        fillRate: 0
      };
    }

    const totalFields = rows.length * metadata.headers.length;
    const emptyFields = rows.reduce((count, row) => {
      return count + metadata.headers.filter(header => 
        !row[header] || row[header].toString().trim() === ''
      ).length;
    }, 0);

    const fillRate = ((totalFields - emptyFields) / totalFields) * 100;

    return {
      totalRows: rows.length,
      totalColumns: metadata.headers.length,
      totalFields,
      emptyFields,
      fillRate: Math.round(fillRate * 100) / 100,
      delimiter: metadata.delimiter,
      fileSize: metadata.fileSize,
      loadedAt: metadata.loadedAt
    };
  }

  /**
   * Sample rows for preview
   */
  sampleRows(data: CSVData, count: number = 5): CSVRow[] {
    return data.rows.slice(0, count);
  }
}