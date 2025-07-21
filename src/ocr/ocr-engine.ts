import sharp from 'sharp';
import Tesseract from 'tesseract.js';
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
   * Initialize the OCR worker with improved error handling and fallback
   */
  async initialize(): Promise<void> {
    try {
      // Validate settings before initialization
      const validation = await OCREngine.validateSettings(this.settings);
      if (!validation.valid) {
        throw new Error(`OCR settings validation failed: ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        this.logger.warn('OCR settings warnings', { warnings: validation.warnings });
      }

      this.logger.info('Initializing OCR Engine', {
        language: this.settings.language,
        mode: this.settings.mode
      });

      // Try to create worker with specified language
      try {
        this.worker = await Tesseract.createWorker(this.settings.language);
      } catch (languageError) {
        this.logger.warn(`Failed to initialize with language '${this.settings.language}', trying English fallback`, {
          originalError: languageError instanceof Error ? languageError.message : 'Unknown error'
        });
        
        // Fallback to English if specified language fails
        try {
          this.worker = await Tesseract.createWorker('eng');
          this.logger.info('OCR Engine initialized with English fallback');
        } catch (fallbackError) {
          throw new Error(`Failed to initialize OCR with both '${this.settings.language}' and English fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        }
      }

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
      // Validate input buffer
      if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        this.logger.warn('Invalid or empty image buffer, returning original');
        return imageBuffer;
      }

      let image = sharp(imageBuffer);

      // Get image metadata with error handling
      let metadata;
      try {
        metadata = await image.metadata();
        if (!metadata.width || !metadata.height) {
          this.logger.warn('Invalid image dimensions, skipping preprocessing');
          return imageBuffer;
        }
      } catch (metadataError) {
        this.logger.warn('Failed to get image metadata, returning original buffer', { error: metadataError });
        return imageBuffer;
      }

      this.logger.debug('Image preprocessing started', {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        options
      });

      // Apply each transformation with individual error handling
      try {
        // Apply cropping if specified
        if (options.cropRegion) {
          const { left, top, width, height } = options.cropRegion;
          // Validate crop region
          if (left >= 0 && top >= 0 && width > 0 && height > 0 &&
            left + width <= metadata.width! && top + height <= metadata.height!) {
            image = image.extract({ left, top, width, height });
            this.logger.debug('Applied crop region', options.cropRegion);
          } else {
            this.logger.warn('Invalid crop region, skipping', options.cropRegion);
          }
        }
      } catch (cropError) {
        this.logger.warn('Crop operation failed, continuing without crop', { error: cropError });
      }

      try {
        // Scale image if specified
        if (options.scale && options.scale !== 1 && options.scale > 0 && options.scale < 10) {
          const newWidth = Math.round((metadata.width || 0) * options.scale);
          const newHeight = Math.round((metadata.height || 0) * options.scale);
          if (newWidth > 0 && newHeight > 0) {
            image = image.resize(newWidth, newHeight, { kernel: sharp.kernel.lanczos3 });
            this.logger.debug('Applied scaling', { scale: options.scale, newWidth, newHeight });
          }
        }
      } catch (scaleError) {
        this.logger.warn('Scaling operation failed, continuing without scale', { error: scaleError });
      }

      try {
        // Convert to grayscale for better OCR performance
        image = image.grayscale();
      } catch (grayscaleError) {
        this.logger.warn('Grayscale conversion failed, continuing with original', { error: grayscaleError });
      }

      try {
        // Enhance contrast if requested
        if (options.enhanceContrast) {
          image = image.normalise();
          this.logger.debug('Applied contrast enhancement');
        }
      } catch (contrastError) {
        this.logger.warn('Contrast enhancement failed, continuing without enhancement', { error: contrastError });
      }

      try {
        // Apply threshold for binarization
        if (options.threshold !== undefined && options.threshold >= 0 && options.threshold <= 255) {
          image = image.threshold(options.threshold);
          this.logger.debug('Applied threshold', { threshold: options.threshold });
        }
      } catch (thresholdError) {
        this.logger.warn('Threshold operation failed, continuing without threshold', { error: thresholdError });
      }

      try {
        // Denoise if requested
        if (options.denoise) {
          image = image.median(3);
          this.logger.debug('Applied denoising');
        }
      } catch (denoiseError) {
        this.logger.warn('Denoise operation failed, continuing without denoise', { error: denoiseError });
      }

      // Convert to PNG format for consistency with final error handling
      let processedBuffer: Buffer;
      try {
        processedBuffer = await image.png().toBuffer();
      } catch (pngError) {
        this.logger.warn('PNG conversion failed, trying JPEG format', { error: pngError });
        try {
          processedBuffer = await image.jpeg({ quality: 90 }).toBuffer();
        } catch (jpegError) {
          this.logger.error('Both PNG and JPEG conversion failed, returning original buffer', {
            pngError,
            jpegError
          });
          return imageBuffer;
        }
      }

      this.logger.debug('Image preprocessing completed', {
        originalSize: imageBuffer.length,
        processedSize: processedBuffer.length
      });

      return processedBuffer;

    } catch (error) {
      this.logger.error('Image preprocessing failed completely, returning original buffer', { error });
      // Return original buffer as fallback instead of throwing
      return imageBuffer;
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
      // Try preprocessing first, but fall back to original if it fails
      let processedImage: Buffer;
      try {
        processedImage = await this.preprocessImage(imageBuffer, preprocessingOptions);
        this.logger.debug('Image preprocessing successful');
      } catch (preprocessError) {
        this.logger.warn('Image preprocessing failed, using original image', { error: preprocessError });
        processedImage = imageBuffer;
      }

      // Extract text from processed (or original) image
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
      this.logger.error('OCR extraction with preprocessing failed', { error });

      // Try one more time with just the original buffer and minimal processing
      try {
        this.logger.info('Attempting OCR fallback with original image buffer');
        const fallbackResult = await this.extractText(imageBuffer);

        this.logger.warn('OCR fallback succeeded', {
          confidence: fallbackResult.confidence,
          wordCount: fallbackResult.words.length
        });

        return fallbackResult;
      } catch (fallbackError) {
        this.logger.error('OCR fallback also failed', { fallbackError });

        // Return empty result instead of throwing
        return {
          text: '',
          confidence: 0,
          words: [],
          lines: [],
          processingTime: Date.now() - startTime
        };
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
   * Validate OCR settings with language file availability check
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
        // Check if language is in supported list
        if (!supportedLanguages.includes(lang)) {
          warnings.push(`Language '${lang}' not in known supported list, but may still work`);
        }
        
        // Try to check for Tesseract language files
        try {
          // Tesseract.js downloads language files to temp directory during runtime
          // We can't reliably check for their existence beforehand
          // Instead, we'll add a warning for languages that might not be available
          const commonLanguages = ['eng', 'por', 'spa', 'fra', 'deu'];
          if (!commonLanguages.includes(lang)) {
            warnings.push(`Language '${lang}' may require additional download time on first use`);
          }
        } catch (error) {
          // Language file check failed, but this is not critical
          warnings.push(`Could not verify availability of language '${lang}' - will be validated during initialization`);
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
}
