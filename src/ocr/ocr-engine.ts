import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { Logger } from '../core/logger.js';
import type { OCRResult, OCRSettings } from '../types/index.js';

export interface OCREngineOptions {
  settings: OCRSettings;
}

export interface ImagePreprocessingOptions {
  denoise?: boolean;
  enhanceContrast?: boolean;
  threshold?: number;
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
 * Advanced OCR Engine using Tesseract.js for text extraction from images
 * Acts as intelligent fallback when DOM extraction fails
 * Includes image preprocessing and fuzzy matching capabilities
 */
export class OCREngine {
  private logger: Logger;
  private settings: OCRSettings;
  private worker: Tesseract.Worker | null = null;
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
  }

  /**
   * Initialize the OCR worker
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing OCR Engine', {
        language: this.settings.language,
        mode: this.settings.mode
      });

      this.worker = await Tesseract.createWorker(this.settings.language);
      
      // Configure worker parameters for better accuracy
      await this.worker.setParameters({
        tessedit_page_seg_mode: this.settings.mode,
        tessedit_char_whitelist: this.settings.whitelist || '',
      });

      this.initialized = true;
      this.logger.info('OCR Engine initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize OCR engine', error);
      throw error;
    }
  }

  /**
   * Check if the OCR engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Extract text from image buffer
   */
  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.initialized || !this.worker) {
      throw new Error('OCR Engine not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      this.logger.debug('Starting OCR text extraction', {
        imageSize: imageBuffer.length
      });

      const { data } = await this.worker.recognize(imageBuffer);
      const processingTime = Date.now() - startTime;

      const result: OCRResult = {
        text: data.text,
        confidence: data.confidence,
        words: data.words?.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1
          }
        })) || [],
        lines: data.lines?.map(line => ({
          text: line.text,
          confidence: line.confidence,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1
          }
        })) || [],
        processingTime
      };

      this.logger.info('OCR text extraction completed', {
        textLength: result.text.length,
        confidence: result.confidence,
        wordCount: result.words.length,
        processingTime
      });

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
    if (!this.initialized || !this.worker) {
      throw new Error('OCR Engine not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      this.logger.debug('Starting OCR text extraction from file', {
        imagePath
      });

      const { data } = await this.worker.recognize(imagePath);
      const processingTime = Date.now() - startTime;

      const result: OCRResult = {
        text: data.text,
        confidence: data.confidence,
        words: data.words?.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1
          }
        })) || [],
        lines: data.lines?.map(line => ({
          text: line.text,
          confidence: line.confidence,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1
          }
        })) || [],
        processingTime
      };

      this.logger.info('OCR text extraction from file completed', {
        imagePath,
        textLength: result.text.length,
        confidence: result.confidence,
        wordCount: result.words.length,
        processingTime
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to extract text from file via OCR', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.initialized = false;
        this.logger.info('OCR Engine cleaned up');
      } catch (error) {
        this.logger.error('Error cleaning up OCR engine', error);
      }
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   */
  async preprocessImage(
    imageBuffer: Buffer, 
    options: ImagePreprocessingOptions = {}
  ): Promise<Buffer> {
    try {
      let image = sharp(imageBuffer);

      // Get image metadata
      const metadata = await image.metadata();
      this.logger.debug('Image preprocessing started', {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        options
      });

      // Apply cropping if specified
      if (options.cropRegion) {
        const { left, top, width, height } = options.cropRegion;
        image = image.extract({ left, top, width, height });
        this.logger.debug('Applied crop region', options.cropRegion);
      }

      // Scale image if specified
      if (options.scale && options.scale !== 1) {
        const newWidth = Math.round((metadata.width || 0) * options.scale);
        const newHeight = Math.round((metadata.height || 0) * options.scale);
        image = image.resize(newWidth, newHeight);
        this.logger.debug('Applied scaling', { scale: options.scale, newWidth, newHeight });
      }

      // Convert to grayscale for better OCR performance
      image = image.grayscale();

      // Enhance contrast if requested
      if (options.enhanceContrast) {
        image = image.normalise();
        this.logger.debug('Applied contrast enhancement');
      }

      // Apply threshold for binarization
      if (options.threshold !== undefined) {
        image = image.threshold(options.threshold);
        this.logger.debug('Applied threshold', { threshold: options.threshold });
      }

      // Denoise if requested
      if (options.denoise) {
        image = image.median(3);
        this.logger.debug('Applied denoising');
      }

      // Convert to PNG format for consistency
      const processedBuffer = await image.png().toBuffer();
      
      this.logger.debug('Image preprocessing completed', {
        originalSize: imageBuffer.length,
        processedSize: processedBuffer.length
      });

      return processedBuffer;

    } catch (error) {
      this.logger.error('Image preprocessing failed', error);
      throw new Error(`Image preprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text with automatic preprocessing for better results
   */
  async extractTextWithPreprocessing(
    imageBuffer: Buffer, 
    preprocessingOptions: ImagePreprocessingOptions = {}
  ): Promise<OCRResult> {
    if (!this.initialized || !this.worker) {
      throw new Error('OCR Engine not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    this.processingStats.totalImages++;

    try {
      // Preprocess the image
      const processedImage = await this.preprocessImage(imageBuffer, preprocessingOptions);

      // Extract text from processed image
      const result = await this.extractText(processedImage);

      // Update statistics
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
      this.logger.error('OCR extraction with preprocessing failed', error);
      throw error;
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
        const result = await this.extractTextWithPreprocessing(
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
   * Get supported languages
   */
  static getSupportedLanguages(): string[] {
    return [
      'eng', 'por', 'spa', 'fra', 'deu', 'ita', 'rus', 'chi_sim', 'chi_tra', 'jpn',
      'kor', 'ara', 'tha', 'vie', 'hin', 'ben', 'tel', 'tam', 'guj', 'kan'
    ];
  }

  /**
   * Validate OCR settings
   */
  static validateSettings(settings: OCRSettings): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const supportedLanguages = OCREngine.getSupportedLanguages();

    if (!supportedLanguages.includes(settings.language)) {
      errors.push(`Unsupported language: ${settings.language}. Supported: ${supportedLanguages.join(', ')}`);
    }

    if (settings.mode < 0 || settings.mode > 13) {
      errors.push(`Invalid page segmentation mode: ${settings.mode}. Must be 0-13`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}