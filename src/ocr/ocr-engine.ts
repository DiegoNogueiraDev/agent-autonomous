import Tesseract from 'tesseract.js';
import { Logger } from '../core/logger.js';
import type { OCRResult, OCRSettings } from '../types/index.js';

export interface OCREngineOptions {
  settings: OCRSettings;
}

/**
 * OCR Engine using Tesseract.js for text extraction from images
 * Acts as fallback when DOM extraction fails
 */
export class OCREngine {
  private logger: Logger;
  private settings: OCRSettings;
  private worker: Tesseract.Worker | null = null;
  private initialized: boolean = false;

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
   * Get OCR processing statistics
   */
  getStats(): { initialized: boolean; language: string; mode: number } {
    return {
      initialized: this.initialized,
      language: this.settings.language,
      mode: this.settings.mode
    };
  }
}