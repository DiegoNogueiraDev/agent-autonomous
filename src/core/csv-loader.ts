import { readFile, stat } from 'fs/promises';
import Papa from 'papaparse';
import { z } from 'zod';
import type {
  CSVData,
  CSVMetadata,
  CSVRow,
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
  tolerantMode?: boolean;  // Modo tolerante a falhas
  errorThreshold?: number; // Percentual máximo de linhas com erro (0.0 a 1.0)
  autoFixCorruption?: boolean; // Tentar corrigir automaticamente dados corrompidos
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
    encoding: 'utf-8',
    tolerantMode: true,     // Habilitado por padrão para melhor UX
    errorThreshold: 0.3,    // 30% máximo de linhas com erro
    autoFixCorruption: true // Tentar corrigir automaticamente
  };

  // Maximum file size: 10MB
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

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
   * Validate CSV file before processing
   */
  async validateCsvFile(filePath: string, tolerantMode: boolean = false): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check file stats
      const fileStats = await stat(filePath);

      // Validate file size
      if (fileStats.size > CSVLoader.MAX_FILE_SIZE) {
        errors.push(`File too large: ${Math.round(fileStats.size / 1024 / 1024)}MB (max 10MB)`);
      }

      if (fileStats.size === 0) {
        errors.push('File is empty');
        return { valid: false, errors };
      }

      // Read sample to validate structure
      const sampleSize = Math.min(fileStats.size, 4096); // Read first 4KB
      const fileHandle = await readFile(filePath, { encoding: 'utf-8' });
      const sample = fileHandle.substring(0, sampleSize);

      // Check for basic CSV structure
      const lines = sample.split('\n').filter(line => line.trim().length > 0);

      if (lines.length === 0) {
        errors.push('No valid lines found in file');
        return { valid: false, errors };
      }

      // Detect delimiter and validate consistency
      const delimiter = this.detectDelimiter(sample);
      const firstLineColumns = lines[0]?.split(delimiter).length || 0;

      if (firstLineColumns < 2) {
        errors.push('File appears to have only one column - invalid CSV structure');
      }

      // Check consistency across first few lines (allow some tolerance)
      const sampleLines = lines.slice(0, Math.min(5, lines.length));
      const columnCounts = sampleLines.map(line => line.split(delimiter).length);
      const maxColumns = Math.max(...columnCounts);
      const minColumns = Math.min(...columnCounts);

      // Em modo tolerante, ser muito mais permissivo
      const tolerance = tolerantMode
        ? Math.max(5, Math.floor(maxColumns * 0.5))  // 50% de variância permitida em modo tolerante
        : Math.max(2, Math.floor(maxColumns * 0.2)); // 20% em modo normal
      const isAcceptable = (maxColumns - minColumns) <= tolerance;

      if (!isAcceptable && !tolerantMode) {
        errors.push(`Significant column count variance detected: ${columnCounts.join(', ')} (max variance allowed: ${tolerance})`);
      } else if (!isAcceptable && tolerantMode) {
        console.warn(`⚠️ Variação de colunas detectada (modo tolerante): ${columnCounts.join(', ')}`);
      }

      // Validate encoding
      if (sample.includes('\uFFFD')) {
        errors.push('File appears to have encoding issues');
      }

    } catch (error) {
      errors.push(`Error validating file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Tentar corrigir automaticamente dados CSV corrompidos
   */
  private autoFixCsvCorruption(content: string, delimiter: string): string {
    const lines = content.split('\n');
    if (lines.length < 2) return content;

    // Detectar número esperado de colunas baseado no cabeçalho
    const headerLine = lines[0];
    if (!headerLine) return content;

    const headerCols = headerLine.split(delimiter).length;
    if (headerCols === 0) return content;

    const fixedLines: string[] = [headerLine]; // Manter cabeçalho

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const cols = line.split(delimiter);

      if (cols.length < headerCols) {
        // Adicionar colunas faltantes com valores vazios
        const missingCols = headerCols - cols.length;
        const paddedLine = line + delimiter.repeat(missingCols);
        fixedLines.push(paddedLine);
      } else if (cols.length > headerCols) {
        // Truncar colunas extras
        const truncatedCols = cols.slice(0, headerCols);
        const truncatedLine = truncatedCols.join(delimiter);
        fixedLines.push(truncatedLine);
      } else {
        // Linha OK
        fixedLines.push(line);
      }
    }

    return fixedLines.join('\n');
  }

  /**
   * Load and parse CSV file
   */
  async load(filePath: string, config?: CSVConfig): Promise<CSVData> {
    const mergedConfig = { ...this.defaultConfig, ...config };

    try {
      // Validate file first (com modo tolerante se habilitado)
      const validation = await this.validateCsvFile(filePath, mergedConfig.tolerantMode);
      if (!validation.valid && !mergedConfig.tolerantMode) {
        throw new Error(`CSV validation failed: ${validation.errors.join(', ')}`);
      }

      // Se estiver em modo tolerante, apenas log os erros como warnings
      if (mergedConfig.tolerantMode && validation.errors.length > 0) {
        console.warn('⚠️ Avisos de validação CSV (modo tolerante habilitado):', validation.errors);
      }

      // Read file and get metadata
      const [fileContent, fileStats] = await Promise.all([
        readFile(filePath, mergedConfig.encoding),
        stat(filePath)
      ]);

      // Auto-detect delimiter if needed
      const delimiter = mergedConfig.delimiter === 'auto'
        ? this.detectDelimiter(fileContent)
        : mergedConfig.delimiter;

      // Auto-fix corruption if enabled
      let processedContent = fileContent;
      if (mergedConfig.autoFixCorruption && mergedConfig.tolerantMode) {
        try {
          processedContent = this.autoFixCsvCorruption(fileContent, delimiter);
          if (processedContent !== fileContent) {
            console.warn('⚠️ Corrupção detectada e corrigida automaticamente no CSV');
          }
        } catch (fixError) {
          console.warn('⚠️ Não foi possível corrigir automaticamente o CSV:', fixError);
          // Continuar com conteúdo original
        }
      }

      // Parse CSV com configurações aprimoradas para UTF-8 e modo tolerante
      const parseResult = Papa.parse<CSVRow>(processedContent, {
        delimiter,
        header: mergedConfig.headers,
        skipEmptyLines: mergedConfig.skipEmptyLines,
        transformHeader: mergedConfig.trimHeaders
          ? (header: string) => header.trim().toLowerCase()
          : undefined,
        transform: (value: string) => value.trim(),
        dynamicTyping: false, // Keep everything as strings for consistency
        fastMode: false,      // Usar modo mais robusto
        skipFirstNLines: 0,
        quoteChar: '"',
        escapeChar: '"',
        comments: false
      });

      if (parseResult.errors.length > 0) {
        const criticalErrors = parseResult.errors.filter(error =>
          error.type === 'Delimiter' || error.type === 'FieldMismatch'
        );

        // Em modo tolerante, apenas avisar sobre erros não críticos
        if (mergedConfig.tolerantMode) {
          const errorCount = parseResult.errors.length;
          const totalRows = parseResult.data.length;
          const errorRate = totalRows > 0 ? errorCount / totalRows : 0;

          console.warn(`⚠️ Encontrados ${errorCount} erros de parsing (${(errorRate * 100).toFixed(1)}% das linhas)`);

          // Log detalhes dos erros em modo tolerante
          parseResult.errors.slice(0, 5).forEach(error => {
            console.warn(`   - Linha ${error.row}: ${error.message}`);
          });

          if (parseResult.errors.length > 5) {
            console.warn(`   - ... e mais ${parseResult.errors.length - 5} erros`);
          }

          // Se taxa de erro exceder threshold, ainda falhar
          if (errorRate > mergedConfig.errorThreshold) {
            throw new Error(`Taxa de erro muito alta: ${(errorRate * 100).toFixed(1)}% (máximo permitido: ${(mergedConfig.errorThreshold * 100).toFixed(1)}%). Considere corrigir o arquivo CSV ou aumentar errorThreshold.`);
          }
        } else {
          // Modo normal - tratar erros críticos
          if (criticalErrors.length > 0) {
            const errorDetails = criticalErrors.slice(0, 3).map(e =>
              `Linha ${e.row || 'N/A'}: ${e.message}`
            ).join('; ');
            throw new Error(`CSV parsing failed: ${errorDetails}${criticalErrors.length > 3 ? `... (${criticalErrors.length - 3} more errors)` : ''}`);
          }
        }
      }

      // Filter and limit rows
      let rows = parseResult.data.filter(row =>
        Object.values(row).some(value => value && value.toString().trim())
      );

      if (mergedConfig.maxRows && rows.length > mergedConfig.maxRows) {
        console.warn(`⚠️ Limitando a ${mergedConfig.maxRows} linhas (total no arquivo: ${rows.length})`);
        rows = rows.slice(0, mergedConfig.maxRows);
      }

      // Extract headers
      const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];

      // Additional validation after parsing
      if (headers.length === 0) {
        if (mergedConfig.tolerantMode) {
          throw new Error('Nenhum cabeçalho encontrado no arquivo CSV. Verifique se o arquivo tem pelo menos uma linha de cabeçalho.');
        }
        throw new Error('No headers found in CSV file');
      }

      if (rows.length === 0) {
        if (mergedConfig.tolerantMode) {
          throw new Error('Nenhuma linha de dados encontrada no arquivo CSV. O arquivo parece estar vazio ou só conter cabeçalhos.');
        }
        throw new Error('No data rows found in CSV file');
      }

      // Check for duplicate headers
      const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
      if (duplicateHeaders.length > 0) {
        if (mergedConfig.tolerantMode) {
          console.warn(`⚠️ Cabeçalhos duplicados encontrados: ${duplicateHeaders.join(', ')}. Isso pode causar problemas na validação.`);
        } else {
          throw new Error(`Duplicate headers found: ${duplicateHeaders.join(', ')}`);
        }
      }

      // Create metadata
      const metadata: CSVMetadata = {
        totalRows: rows.length,
        delimiter,
        headers,
        loadedAt: new Date(),
        filePath,
        fileSize: fileStats.size
      };

      // Log summary em modo tolerante
      if (mergedConfig.tolerantMode) {
        console.log(`✅ CSV carregado com sucesso: ${rows.length} linhas, ${headers.length} colunas`);
        console.log(`   Cabeçalhos: ${headers.join(', ')}`);
        if (parseResult.errors.length > 0) {
          console.log(`   ⚠️ ${parseResult.errors.length} avisos de parsing foram ignorados`);
        }
      }

      return {
        rows,
        metadata
      };

    } catch (error) {
      if (error instanceof Error) {
        // Melhorar mensagens de erro para usuário final
        if (mergedConfig.tolerantMode) {
          // Fornecer dicas úteis para correção
          let userFriendlyMessage = `Falha ao carregar arquivo CSV: ${error.message}\n\n`;
          userFriendlyMessage += `💡 Dicas para corrigir:\n`;
          userFriendlyMessage += `   • Verifique se o arquivo está em formato CSV válido\n`;
          userFriendlyMessage += `   • Certifique-se de que todas as linhas têm o mesmo número de colunas\n`;
          userFriendlyMessage += `   • Verifique se há caracteres especiais ou quebras de linha dentro dos campos\n`;
          userFriendlyMessage += `   • Considere abrir o arquivo em um editor de planilhas e salvá-lo novamente como CSV\n`;
          userFriendlyMessage += `   • Se o problema persistir, aumente o 'errorThreshold' na configuração`;

          throw new Error(userFriendlyMessage);
        }
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
        !row?.[header] || row[header]?.toString().trim() === ''
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
