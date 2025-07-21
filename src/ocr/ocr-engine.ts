import { Logger } from '../core/logger.js';
import type { OCRResult, OCRSettings } from '../types/index.js';
import { PythonOCRClient } from './python-ocr-client.js';

export interface OCREngineOptions {
  settings: OCRSettings;
}

export interface ImagePreprocessingOptions {
  denoise?: boolean;
  enhanceContrast?: boolean;
  threshold?: boolean;
  scale?: number;
  cropRegion?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface OCRSearchOptions {
  searchText: string;
  fuzzyMatch?: boolean;
  confidenceThreshold?: number;
  similarity?: number;
}

/**
 * Enhanced OCR Engine - Wrapper para Python OCR Client
 * Mantém compatibilidade com API antiga mas usa Python Tesseract internamente
 *
 * @deprecated Use PythonOCRClient diretamente para novos projetos
 */
export class OCREngine {
  private logger: Logger;
  private settings: OCRSettings;
  private pythonClient: PythonOCRClient;
  private initialized: boolean = false;
  private processingStats: {
    totalImages: number;
    successfulExtractions: number;
    averageConfidence: number;
    averageProcessingTime: number;
  } = {
      totalImages: 0,
      successfulExtractions: 0,
      averageConfidence: 0,
      averageProcessingTime: 0
    };

  constructor(options: OCREngineOptions) {
    this.logger = Logger.getInstance();
    this.settings = options.settings;

    // Criar cliente Python com configurações compatíveis
    this.pythonClient = new PythonOCRClient({
      pythonServiceUrl: process.env.PYTHON_OCR_URL || 'http://localhost:5000',
      timeout: 30000,
      retryAttempts: 3
    });
  }

  /**
   * Initialize the OCR engine (wrapper para Python client)
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing OCR Engine (Python backend)', {
        language: this.settings.language,
        mode: this.settings.mode
      });

      await this.pythonClient.initialize();
      this.initialized = true;
      this.logger.info('OCR Engine initialized successfully with Python backend');

    } catch (error) {
      this.logger.error('Failed to initialize OCR engine', error);
      throw new Error(
        `Failed to initialize OCR engine: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'Please ensure Python OCR service is running on http://localhost:5000'
      );
    }
  }

  /**
   * Check if the OCR engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.pythonClient.isInitialized();
  }

  /**
   * Extract text from image buffer
   */
  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('OCR Engine not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug('Starting OCR text extraction', {
        imageSize: imageBuffer.length
      });

      const result = await this.pythonClient.extractText(imageBuffer);

      // Atualizar estatísticas
      this.processingStats.totalImages++;
      this.processingStats.successfulExtractions++;
      this.updateProcessingStats(result.confidence, result.processingTime);

      return result;

    } catch (error) {
      this.logger.error('Failed to extract text via OCR', error);
      throw error;
    }
  }

  /**
   * Extract text from image file path
   */
  async extractTextFromFile(imagePath: string): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('OCR Engine not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug('Starting OCR text extraction from file', {
        imagePath
      });

      const result = await this.pythonClient.extractTextFromFile(imagePath);

      this.logger.info('OCR text extraction from file completed', {
        imagePath,
        textLength: result.text.length,
        confidence: result.confidence,
        wordCount: result.words.length,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to extract text from file via OCR', error);
      throw error;
    }
  }

  /**
   * Preprocess image for better OCR accuracy (delegado para Python)
   */
  async preprocessImage(
    imageBuffer: Buffer,
    _options: ImagePreprocessingOptions = {}
  ): Promise<Buffer> {
    // O Python OCR service lida com pré-processamento internamente
    return imageBuffer;
  }

  /**
   * Extract text with automatic preprocessing for better results
   */
  async extractTextWithPreprocessing(
    imageBuffer: Buffer,
    preprocessingOptions: ImagePreprocessingOptions = {}
  ): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('OCR Engine not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    this.processingStats.totalImages++;

    try {
      this.logger.debug('Starting OCR extraction with preprocessing', {
        imageSize: imageBuffer.length,
        preprocessingOptions
      });

      const result = await this.pythonClient.extractTextWithPreprocessing(
        imageBuffer,
        {
          denoise: preprocessingOptions.denoise,
          enhanceContrast: preprocessingOptions.enhanceContrast,
          threshold: preprocessingOptions.threshold || false,
          scale: preprocessingOptions.scale,
          cropRegion: preprocessingOptions.cropRegion
        } as any
      );

      this.processingStats.successfulExtractions++;
      this.updateProcessingStats(result.confidence, result.processingTime);

      this.logger.info('OCR extraction with preprocessing completed', {
        confidence: result.confidence,
        wordCount: result.words.length,
        totalTime: Date.now() - startTime,
        preprocessingApplied: Object.keys(preprocessingOptions).length > 0
      });

      return result;

    } catch (error) {
      this.logger.error('OCR extraction with preprocessing failed', { error });

      // Try fallback with basic extraction
      try {
        this.logger.info('Attempting OCR fallback with basic extraction');
        const fallbackResult = await this.extractText(imageBuffer);

        this.logger.warn('OCR fallback succeeded', {
          confidence: fallbackResult.confidence,
          wordCount: fallbackResult.words.length
        });

        return fallbackResult;
      } catch (fallbackError) {
        this.logger.error('OCR fallback also failed', { fallbackError });

        // Return empty result instead of throwing
        return this.getEmptyResult();
      }
    }
  }

  /**
   * Search for specific text in OCR results with fuzzy matching
   */
  searchTextInResults(
    ocrResult: OCRResult,
    searchOptions: OCRSearchOptions
  ): Array<{
    match: string;
    confidence: number;
    similarity: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }> {
    const { searchText, fuzzyMatch = true, confidenceThreshold = 0.5, similarity = 0.8 } = searchOptions;
    const results: Array<{
      match: string;
      confidence: number;
      similarity: number;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
    }> = [];

    // Search in words
    for (const word of ocrResult.words) {
      if (word.confidence < confidenceThreshold) continue;

      let matchFound = false;
      let calculatedSimilarity = 0;

      if (fuzzyMatch) {
        calculatedSimilarity = this.calculateSimilarity(word.text, searchText);
        matchFound = calculatedSimilarity >= similarity;
      } else {
        matchFound = word.text.toLowerCase().includes(searchText.toLowerCase());
        calculatedSimilarity = matchFound ? 1 : 0;
      }

      if (matchFound) {
        results.push({
          match: word.text,
          confidence: word.confidence,
          similarity: calculatedSimilarity,
          bbox: word.bbox
        });
      }
    }

    // Search in lines for multi-word matches
    for (const line of ocrResult.lines) {
      if (line.confidence < confidenceThreshold) continue;

      let matchFound = false;
      let calculatedSimilarity = 0;

      if (fuzzyMatch) {
        calculatedSimilarity = this.calculateSimilarity(line.text, searchText);
        matchFound = calculatedSimilarity >= similarity;
      } else {
        matchFound = line.text.toLowerCase().includes(searchText.toLowerCase());
        calculatedSimilarity = matchFound ? 1 : 0;
      }

      if (matchFound) {
        results.push({
          match: line.text,
          confidence: line.confidence,
          similarity: calculatedSimilarity,
          bbox: line.bbox
        });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Extract text from specific region of an image
   */
  async extractTextFromRegion(
    imageBuffer: Buffer,
    region: { x: number; y: number; width: number; height: number },
    preprocessingOptions: ImagePreprocessingOptions = {}
  ): Promise<OCRResult> {
    const regionOptions: ImagePreprocessingOptions = {
      ...preprocessingOptions,
      cropRegion: {
        left: region.x,
        top: region.y,
        width: region.width,
        height: region.height
      }
    };

    return this.extractTextWithPreprocessing(imageBuffer, regionOptions);
  }

  /**
   * Batch process multiple images
   */
  async batchExtractText(
    images: Array<{ buffer: Buffer; id: string; preprocessingOptions?: ImagePreprocessingOptions }>
  ): Promise<Array<{ id: string; result: OCRResult; error?: string }>> {
    const results: Array<{ id: string; result: OCRResult; error?: string }> = [];

    for (const image of images) {
      try {
        const result = await this.pythonClient.extractTextWithPreprocessing(
          image.buffer,
          image.preprocessingOptions || {}
        );
        results.push({ id: image.id, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Batch OCR failed for image ${image.id}`, error);
        results.push({
          id: image.id,
          result: this.getEmptyResult(),
          error: errorMessage
        });
      }
    }

    return results;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const a = normalize(str1);
    const b = normalize(str2);

    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }

    const maxLength = Math.max(a.length, b.length);
    const distance = matrix[b.length]![a.length]!;
    return (maxLength - distance) / maxLength;
  }

  /**
   * Update processing statistics
   */
  private updateProcessingStats(confidence: number, processingTime: number): void {
    const totalSuccessful = this.processingStats.successfulExtractions;

    this.processingStats.averageConfidence =
      (this.processingStats.averageConfidence * (totalSuccessful - 1) + confidence) / totalSuccessful;

    this.processingStats.averageProcessingTime =
      (this.processingStats.averageProcessingTime * (totalSuccessful - 1) + processingTime) / totalSuccessful;
  }

  /**
   * Get empty OCR result for error cases
   */
  private getEmptyResult(): OCRResult {
    return {
      text: '',
      confidence: 0,
      words: [],
      lines: [],
      processingTime: 0,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      preprocessing: [],
      language: this.settings.language
    };
  }

  /**
   * Get comprehensive OCR processing statistics
   */
  getStats() {
    const successRate = this.processingStats.totalImages > 0
      ? this.processingStats.successfulExtractions / this.processingStats.totalImages
      : 0;

    return {
      initialized: this.initialized,
      language: this.settings.language,
      mode: this.settings.mode,
      backend: 'python',
      processing: {
        totalImages: this.processingStats.totalImages,
        successfulExtractions: this.processingStats.successfulExtractions,
        successRate: Math.round(successRate * 100),
        averageConfidence: Math.round(this.processingStats.averageConfidence * 100),
        averageProcessingTime: Math.round(this.processingStats.averageProcessingTime)
      }
    };
  }

  /**
   * Reset processing statistics
   */
  resetStats(): void {
    this.processingStats = {
      totalImages: 0,
      successfulExtractions: 0,
      averageConfidence: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Get supported languages (delegado para Python)
   */
  static getSupportedLanguages(): string[] {
    return [
      'eng', 'por', 'spa', 'fra', 'deu', 'ita', 'rus', 'chi_sim', 'chi_tra', 'jpn',
      'kor', 'ara', 'tha', 'vie', 'hin', 'ben', 'tel', 'tam', 'guj', 'kan'
    ];
  }

  /**
   * Validate OCR settings (compatível com API antiga)
   */
  static async validateSettings(settings: OCRSettings): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const supportedLanguages = OCREngine.getSupportedLanguages();

    // Validate language format first
    if (!settings.language || !/^[a-z_]{3,}(\+[a-z_]{3,})*$/.test(settings.language)) {
      errors.push('Invalid language format. Use ISO 639-2/3 format (e.g., "eng", "por", "eng+por")');
    } else {
      // Parse individual languages
      const languages = settings.language.split('+');

      for (const lang of languages) {
        if (!supportedLanguages.includes(lang)) {
          warnings.push(`Language '${lang}' not in known supported list, but may still work`);
        }
      }
    }

    // Validate page segmentation mode
    if (settings.mode !== undefined && (settings.mode < 0 || settings.mode > 13)) {
      errors.push(`Invalid page segmentation mode: ${settings.mode}. Must be 0-13`);
    }

    // Validate confidence threshold
    if (settings.confidenceThreshold !== undefined &&
      (settings.confidenceThreshold < 0 || settings.confidenceThreshold > 100)) {
      errors.push(`Invalid confidence threshold: ${settings.confidenceThreshold}. Must be 0-100`);
    }

    // Validate whitelist characters
    if (settings.whitelist !== undefined && settings.whitelist.length > 200) {
      warnings.push('Character whitelist is very long and may impact performance');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Synchronous version for backward compatibility
   */
  static validateSettingsSync(settings: OCRSettings): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const supportedLanguages = OCREngine.getSupportedLanguages();

    // Basic format validation
    if (!settings.language || !/^[a-z_]{3,}(\+[a-z_]{3,})*$/.test(settings.language)) {
      errors.push('Invalid language format. Use ISO 639-2/3 format (e.g., "eng", "por", "eng+por")');
    } else {
      const languages = settings.language.split('+');
      for (const lang of languages) {
        if (!supportedLanguages.includes(lang)) {
          errors.push(`Potentially unsupported language: ${lang}`);
        }
      }
    }

    if (settings.mode !== undefined && (settings.mode < 0 || settings.mode > 13)) {
      errors.push(`Invalid page segmentation mode: ${settings.mode}. Must be 0-13`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.pythonClient.cleanup();
      this.initialized = false;
      this.logger.info('OCR Engine cleaned up (Python backend)');
    } catch (error) {
      this.logger.error('Error cleaning up OCR engine', error);
    }
  }
}
