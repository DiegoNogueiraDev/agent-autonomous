import { Logger } from '../core/logger.js';
import type { OCRResult } from '../types/index.js';

export interface PythonOCRClientOptions {
  pythonServiceUrl?: string;
  timeout?: number;
  retryAttempts?: number;
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
 * Python OCR Client - Communicates with Python OCR service for enhanced accuracy
 * Replaces Tesseract.js with Python Tesseract for better OCR performance
 */
export class PythonOCRClient {
  private logger: Logger;
  private pythonServiceUrl: string;
  private timeout: number;
  private retryAttempts: number;
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

  constructor(options: PythonOCRClientOptions = {}) {
    this.logger = Logger.getInstance();
    this.pythonServiceUrl = options.pythonServiceUrl || 'http://localhost:5000';
    this.timeout = options.timeout || 30000; // 30 seconds
    this.retryAttempts = options.retryAttempts || 3;
  }

  /**
   * Initialize the Python OCR client
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Python OCR Client', {
        serviceUrl: this.pythonServiceUrl,
        timeout: this.timeout
      });

      // Check if Python OCR service is available
      const healthCheck = await this.checkHealth();
      if (!healthCheck) {
        throw new Error('Python OCR service is not available');
      }

      this.initialized = true;
      this.logger.info('Python OCR Client initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Python OCR client', error);
      throw error;
    }
  }

  /**
   * Check if the Python OCR service is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.pythonServiceUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return data.status === 'healthy';
      }

      return false;
    } catch (error) {
      this.logger.warn('Python OCR service health check failed', error);
      return false;
    }
  }

  /**
   * Check if the OCR client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Extract text from image buffer
   */
  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('Python OCR Client not initialized. Call initialize() first.');
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Image buffer is empty or invalid');
    }

    const startTime = Date.now();

    try {
      this.logger.debug('Starting OCR text extraction', {
        imageSize: imageBuffer.length
      });

      // Validate buffer contains valid image data
      if (imageBuffer.length < 10) {
        throw new Error('Image buffer is too small to contain valid image data');
      }

      // Detect image format and convert buffer to base64
      const imageFormat = this.detectImageFormat(imageBuffer);
      const base64Image = imageBuffer.toString('base64');

      // Prepare request
      const requestBody = {
        image: `data:image/${imageFormat};base64,${base64Image}`,
        options: {
          language: 'eng+por',
          psm: 6,
          oem: 3
        }
      };

      // Make request to Python OCR service
      const response = await this.makeRequest('/extract', requestBody);

      const processingTime = Date.now() - startTime;

      // Convert Python response to TypeScript format
      const result: OCRResult = {
        text: response.text,
        confidence: response.confidence,
        words: response.words.map((word: any) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1
          }
        })),
        lines: response.lines.map((line: any) => ({
          text: line.text,
          confidence: line.confidence,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1
          }
        })),
        processingTime,
        boundingBox: response.boundingBox,
        preprocessing: [],
        language: response.language
      };

      this.logger.info('OCR text extraction completed', {
        textLength: result.text.length,
        confidence: result.confidence,
        wordCount: result.words.length,
        processingTime
      });

      this.updateProcessingStats(result.confidence, processingTime);

      return result;

    } catch (error) {
      this.logger.error('Failed to extract text via Python OCR', error);
      throw error;
    }
  }

  /**
   * Extract text from image file path
   */
  async extractTextFromFile(imagePath: string): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('Python OCR Client not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug('Starting OCR text extraction from file', {
        imagePath
      });

      // Read file as buffer
      const fs = await import('fs');
      const imageBuffer = await fs.promises.readFile(imagePath);

      // Use extractText method
      const result = await this.extractText(imageBuffer);

      this.logger.info('OCR text extraction from file completed', {
        imagePath,
        textLength: result.text.length,
        confidence: result.confidence,
        wordCount: result.words.length,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to extract text from file via Python OCR', error);
      throw error;
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   */
  async preprocessImage(
    imageBuffer: Buffer,
    _options: ImagePreprocessingOptions = {}
  ): Promise<Buffer> {
    // Python OCR service handles preprocessing internally
    // This method is kept for API compatibility
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
      throw new Error('Python OCR Client not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    this.processingStats.totalImages++;

    try {
      this.logger.debug('Starting OCR extraction with preprocessing', {
        imageSize: imageBuffer.length,
        preprocessingOptions
      });

      // Detect image format and convert buffer to base64
      const imageFormat = this.detectImageFormat(imageBuffer);
      const base64Image = imageBuffer.toString('base64');

      // Prepare request with preprocessing options
      const requestBody = {
        image: `data:image/${imageFormat};base64,${base64Image}`,
        options: {
          language: 'eng+por',
          psm: 6,
          oem: 3,
          grayscale: true,
          denoise: preprocessingOptions.denoise || false,
          enhanceContrast: preprocessingOptions.enhanceContrast || false,
          threshold: preprocessingOptions.threshold !== undefined,
          scale: preprocessingOptions.scale || 1,
          crop_region: preprocessingOptions.cropRegion
        }
      };

      // Make request to Python OCR service
      const response = await this.makeRequest('/extract', requestBody);

      const processingTime = Date.now() - startTime;

      // Convert Python response to TypeScript format
      const result: OCRResult = {
        text: response.text,
        confidence: response.confidence,
        words: response.words.map((word: any) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1
          }
        })),
        lines: response.lines.map((line: any) => ({
          text: line.text,
          confidence: line.confidence,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1
          }
        })),
        processingTime,
        boundingBox: response.boundingBox,
        preprocessing: [],
        language: response.language
      };

      this.processingStats.successfulExtractions++;
      this.updateProcessingStats(result.confidence, processingTime);

      this.logger.info('OCR extraction with preprocessing completed', {
        confidence: result.confidence,
        wordCount: result.words.length,
        totalTime: processingTime,
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
   * Make HTTP request to Python OCR service with retry logic
   */
  private async makeRequest(endpoint: string, body: any): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.pythonServiceUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryAttempts) {
          this.logger.warn(`Request attempt ${attempt} failed, retrying...`, { error: lastError.message });
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
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
      language: 'eng'
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
      serviceUrl: this.pythonServiceUrl,
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
   * Get available languages from Python OCR service
   */
  async getAvailableLanguages(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.pythonServiceUrl}/languages`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return data.languages || [];
      }

      return ['eng', 'por']; // Fallback
    } catch (error) {
      this.logger.warn('Failed to get languages from Python OCR service', error);
      return ['eng', 'por']; // Fallback
    }
  }

  /**
   * Detect image format from buffer header
   */
  private detectImageFormat(buffer: Buffer): string {
    if (buffer.length < 4) {
      return 'png'; // Default fallback
    }

    // Check common image format signatures
    const header = buffer.subarray(0, 4);
    
    // PNG: 89 50 4E 47
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
      return 'png';
    }
    
    // JPEG: FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
      return 'jpeg';
    }
    
    // GIF: 47 49 46 38
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
      return 'gif';
    }
    
    // BMP: 42 4D
    if (header[0] === 0x42 && header[1] === 0x4D) {
      return 'bmp';
    }
    
    // WEBP: 52 49 46 46 (first 4 bytes)
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
      // Check for WEBP signature at offset 8
      if (buffer.length >= 12) {
        const webpHeader = buffer.subarray(8, 12);
        if (webpHeader[0] === 0x57 && webpHeader[1] === 0x45 && webpHeader[2] === 0x42 && webpHeader[3] === 0x50) {
          return 'webp';
        }
      }
    }
    
    return 'png'; // Default fallback
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources (no-op for HTTP client)
   */
  async cleanup(): Promise<void> {
    this.logger.info('Python OCR Client cleaned up');
    this.initialized = false;
  }
}
