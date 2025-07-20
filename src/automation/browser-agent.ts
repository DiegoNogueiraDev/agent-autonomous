import { chromium, Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import { Logger } from '../core/logger.js';
import { OCREngine } from '../ocr/ocr-engine.js';
import { ManagedResource, registerResource } from '../core/resource-manager.js';
import type { 
  BrowserSettings, 
  NavigationResult, 
  ExtractedWebData, 
  Screenshot, 
  BoundingBox,
  PageMetadata,
  FieldMapping,
  CSVRow,
  OCRSettings
} from '../types/index.js';

export interface BrowserAgentOptions {
  settings: BrowserSettings;
  headless?: boolean;
  slowMo?: number;
  recordVideo?: boolean;
  ocrSettings?: OCRSettings;
  enableOCRFallback?: boolean;
}

export class BrowserAgent implements ManagedResource {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private logger: Logger;
  private settings: BrowserSettings;
  private cleanedUp: boolean = false;
  private resourceId: string;
  private ocrEngine: OCREngine | null = null;
  private enableOCRFallback: boolean;

  constructor(options: BrowserAgentOptions) {
    this.logger = Logger.getInstance();
    this.settings = options.settings;
    this.enableOCRFallback = options.enableOCRFallback ?? true;
    this.resourceId = `browser-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize OCR Engine if enabled
    if (this.enableOCRFallback && options.ocrSettings) {
      this.ocrEngine = new OCREngine({ settings: options.ocrSettings });
    }
    
    // Register for automatic cleanup
    registerResource(this.resourceId, this);
  }

  /**
   * Initialize browser and context
   */
  async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing browser agent');
      
      this.browser = await chromium.launch({
        headless: this.settings.headless,
        slowMo: this.settings.slowMo,
        timeout: this.settings.timeout,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--allow-running-insecure-content'
        ]
      });

      this.context = await this.browser.newContext({
        viewport: this.settings.viewport,
        userAgent: this.settings.userAgent,
        ignoreHTTPSErrors: true,
        recordVideo: { dir: './data/evidence/videos' }
      });

      this.page = await this.context.newPage();
      
      // Set default timeouts
      this.page.setDefaultTimeout(this.settings.timeout);
      this.page.setDefaultNavigationTimeout(this.settings.timeout);

      // Initialize OCR Engine if enabled
      if (this.enableOCRFallback && this.ocrEngine) {
        try {
          await this.ocrEngine.initialize();
          this.logger.info('OCR fallback enabled and initialized');
        } catch (error) {
          this.logger.warn('OCR initialization failed, continuing without OCR fallback', error);
          this.enableOCRFallback = false;
        }
      }

      this.logger.info('Browser agent initialized successfully', {
        viewport: this.settings.viewport,
        headless: this.settings.headless,
        ocrFallback: this.enableOCRFallback
      });

    } catch (error) {
      this.logger.error('Failed to initialize browser agent', error);
      throw error;
    }
  }

  /**
   * Navigate to URL and handle dynamic content
   */
  async navigateToUrl(url: string, rowData?: CSVRow): Promise<NavigationResult> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const errors: string[] = [];
    const redirects: string[] = [];

    try {
      this.logger.debug('Navigating to URL', { url });

      // Replace URL parameters with row data if provided
      const finalUrl = this.interpolateUrl(url, rowData);
      
      // Listen for redirects
      this.page.on('response', (response) => {
        if (response.status() >= 300 && response.status() < 400) {
          redirects.push(response.url());
        }
      });

      const response = await this.page.goto(finalUrl, {
        waitUntil: 'networkidle',
        timeout: this.settings.timeout
      });

      if (!response) {
        throw new Error('Navigation failed - no response received');
      }

      const status = response.status();
      if (status >= 400) {
        errors.push(`HTTP ${status}: ${response.statusText()}`);
      }

      // Wait for dynamic content to load
      await this.waitForDynamicContent();

      const loadTime = Date.now() - startTime;
      const finalNavigationUrl = this.page.url();

      this.logger.info('Navigation completed', {
        url: finalNavigationUrl,
        loadTime,
        status,
        redirectCount: redirects.length
      });

      return {
        success: status < 400,
        url: finalNavigationUrl,
        loadTime,
        errors,
        redirects,
        finalUrl: finalNavigationUrl
      };

    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown navigation error';
      errors.push(errorMessage);

      this.logger.error('Navigation failed', { url, error: errorMessage, loadTime });

      return {
        success: false,
        url: url,
        loadTime,
        errors,
        redirects,
        finalUrl: url
      };
    }
  }

  /**
   * Extract data from page using field mappings
   */
  async extractWebData(fieldMappings: FieldMapping[]): Promise<ExtractedWebData> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const domData: Record<string, any> = {};
    const extractionMethods: Record<string, any> = {};
    const extractionConfidence: Record<string, number> = {};
    const screenshots: Screenshot[] = [];

    try {
      this.logger.debug('Starting data extraction', { fieldCount: fieldMappings.length });

      // Capture full page screenshot
      const fullScreenshot = await this.captureScreenshot('full-page');
      screenshots.push(fullScreenshot);

      // Extract data for each field mapping
      for (const mapping of fieldMappings) {
        try {
          const extractedValue = await this.extractFieldValue(mapping);
          
          domData[mapping.csvField] = extractedValue.value;
          extractionMethods[mapping.csvField] = extractedValue.method;
          extractionConfidence[mapping.csvField] = extractedValue.confidence;

          // Capture element screenshot if found
          if (extractedValue.element) {
            const elementScreenshot = await this.captureElementScreenshot(
              extractedValue.element, 
              `field-${mapping.csvField}`
            );
            screenshots.push(elementScreenshot);
          }

        } catch (error) {
          this.logger.warn(`Failed to extract field: ${mapping.csvField}`, error);
          domData[mapping.csvField] = null;
          extractionMethods[mapping.csvField] = 'failed';
          extractionConfidence[mapping.csvField] = 0;
        }
      }

      // Get page metadata
      const pageMetadata = await this.getPageMetadata();

      this.logger.info('Data extraction completed', {
        extractedFields: Object.keys(domData).length,
        successfulExtractions: Object.values(domData).filter(v => v !== null).length
      });

      return {
        domData,
        ocrData: {}, // Will be populated by OCR agent
        screenshots,
        pageMetadata,
        extractionMethods,
        extractionConfidence
      };

    } catch (error) {
      this.logger.error('Data extraction failed', error);
      throw error;
    }
  }

  /**
   * Extract value for a specific field mapping
   */
  private async extractFieldValue(mapping: FieldMapping): Promise<{
    value: any;
    method: string;
    confidence: number;
    element?: ElementHandle;
  }> {
    if (!this.page) throw new Error('Page not available');

    // First try DOM extraction
    const domResult = await this.tryDOMExtraction(mapping);
    
    // If DOM extraction was successful, return it
    if (domResult.confidence > 0.5) {
      return domResult;
    }

    // If DOM failed and OCR is enabled, try OCR fallback
    if (this.enableOCRFallback && this.ocrEngine) {
      this.logger.debug(`DOM extraction confidence low (${domResult.confidence}), trying OCR fallback for ${mapping.csvField}`);
      
      try {
        const ocrResult = await this.tryOCRExtraction(mapping);
        
        // Return the best result
        if (ocrResult.confidence > domResult.confidence) {
          return ocrResult;
        }
      } catch (error) {
        this.logger.warn(`OCR fallback failed for ${mapping.csvField}`, error);
      }
    }

    // Return the original DOM result (even if poor)
    return domResult;
  }

  /**
   * Try DOM extraction for a field mapping
   */
  private async tryDOMExtraction(mapping: FieldMapping): Promise<{
    value: any;
    method: string;
    confidence: number;
    element?: ElementHandle;
  }> {
    try {
      // Try to find element using the selector
      const element = await this.page!.$(mapping.webSelector);
      
      if (!element) {
        return {
          value: null,
          method: 'dom_not_found',
          confidence: 0
        };
      }

      // Extract value based on element type and field type
      let value: any;
      const tagName = await element.evaluate(el => el.tagName.toLowerCase());
      
      switch (tagName) {
        case 'input':
          const inputType = await element.getAttribute('type');
          if (inputType === 'checkbox' || inputType === 'radio') {
            value = await element.isChecked();
          } else {
            value = await element.inputValue();
          }
          break;
          
        case 'select':
          value = await element.evaluate(el => (el as any).value);
          break;
          
        case 'textarea':
          value = await element.inputValue();
          break;
          
        default:
          // For div, span, p, etc., get text content
          value = await element.textContent();
          break;
      }

      // Clean and normalize the value
      value = this.normalizeExtractedValue(value, mapping.fieldType);
      
      return {
        value,
        method: 'dom_extraction',
        confidence: value !== null && value !== '' ? 0.9 : 0.3,
        element
      };

    } catch (error) {
      this.logger.debug(`DOM extraction failed for ${mapping.csvField}`, error);
      return {
        value: null,
        method: 'dom_error',
        confidence: 0
      };
    }
  }

  /**
   * Try OCR extraction for a field mapping
   */
  private async tryOCRExtraction(mapping: FieldMapping): Promise<{
    value: any;
    method: string;
    confidence: number;
    element?: ElementHandle;
  }> {
    if (!this.ocrEngine || !this.page) {
      throw new Error('OCR engine not available');
    }

    try {
      // Try to find the element first for targeted extraction
      const element = await this.page.$(mapping.webSelector);
      let screenshotBuffer: Buffer;
      let extractionMethod = 'ocr_fullpage';

      if (element) {
        // Get element bounding box and take targeted screenshot
        const boundingBox = await element.boundingBox();
        if (boundingBox) {
          screenshotBuffer = await this.page.screenshot({
            clip: {
              x: Math.max(0, boundingBox.x - 10),
              y: Math.max(0, boundingBox.y - 10),
              width: Math.min(boundingBox.width + 20, await this.page.evaluate(() => (globalThis as any).innerWidth || 1920)),
              height: Math.min(boundingBox.height + 20, await this.page.evaluate(() => (globalThis as any).innerHeight || 1080))
            }
          });
          extractionMethod = 'ocr_element';
        } else {
          screenshotBuffer = await this.page.screenshot({ fullPage: false });
        }
      } else {
        // Take full page screenshot if element not found
        screenshotBuffer = await this.page.screenshot({ fullPage: false });
      }

      // Extract text using OCR with preprocessing
      const ocrResult = await this.ocrEngine.extractTextWithPreprocessing(screenshotBuffer, {
        enhanceContrast: true,
        denoise: true,
        scale: 2 // Upscale for better OCR accuracy
      });

      // Search for the expected field value in OCR results
      let bestMatch = null;
      let bestConfidence = 0;

      // If we have context about what we're looking for, try to find it
      if (mapping.csvField && ocrResult.words && ocrResult.words.length > 0) {
        // Look for words with high confidence
        const highConfidenceWords = ocrResult.words.filter(word => word.confidence > 0.7);
        
        if (highConfidenceWords.length > 0) {
          // For now, take the first high-confidence word
          // In a real implementation, you'd use more sophisticated matching
          bestMatch = highConfidenceWords[0]?.text;
          bestConfidence = Math.min(0.8, highConfidenceWords[0]?.confidence || 0); // Cap OCR confidence
        } else if (ocrResult.words.length > 0) {
          bestMatch = ocrResult.words[0]?.text;
          bestConfidence = Math.min(0.6, ocrResult.words[0]?.confidence || 0);
        }
      }

      // Normalize the value based on field type
      const normalizedValue = this.normalizeExtractedValue(bestMatch, mapping.fieldType);

      this.logger.debug(`OCR extraction completed for ${mapping.csvField}`, {
        wordsFound: ocrResult.words.length,
        confidence: bestConfidence,
        extractedValue: normalizedValue
      });

      return {
        value: normalizedValue,
        method: extractionMethod,
        confidence: bestConfidence,
        element: element || undefined
      };

    } catch (error) {
      this.logger.error(`OCR extraction failed for ${mapping.csvField}`, error);
      throw error;
    }
  }

  /**
   * Capture full page screenshot
   */
  async captureScreenshot(name: string): Promise<Screenshot> {
    if (!this.page) throw new Error('Page not available');

    try {
      const screenshotBuffer = await this.page.screenshot({
        fullPage: true,
        type: 'png'
      });

      return {
        id: `screenshot_${Date.now()}_${name}`,
        base64Data: screenshotBuffer.toString('base64'),
        timestamp: new Date(),
        quality: 100,
        type: 'png'
      };

    } catch (error) {
      this.logger.error('Screenshot capture failed', error);
      throw error;
    }
  }

  /**
   * Capture element-specific screenshot
   */
  private async captureElementScreenshot(element: ElementHandle, name: string): Promise<Screenshot> {
    try {
      const boundingBox = await element.boundingBox();
      const screenshotBuffer = await element.screenshot({ type: 'png' });

      return {
        id: `element_${Date.now()}_${name}`,
        base64Data: screenshotBuffer.toString('base64'),
        region: boundingBox ? {
          x: boundingBox.x,
          y: boundingBox.y, 
          width: boundingBox.width,
          height: boundingBox.height
        } : undefined,
        timestamp: new Date(),
        quality: 100,
        type: 'png'
      };

    } catch (error) {
      this.logger.warn(`Element screenshot failed for ${name}`, error);
      throw error;
    }
  }

  /**
   * Get page metadata
   */
  private async getPageMetadata(): Promise<PageMetadata> {
    if (!this.page) throw new Error('Page not available');

    const title = await this.page.title();
    const url = this.page.url();
    const viewport = this.page.viewportSize();
    const userAgent = await this.page.evaluate(() => {
      return (globalThis as any).navigator?.userAgent || 'DataHawk/1.0';
    });

    return {
      url,
      title,
      loadTime: 0, // Will be set by navigation
      timestamp: new Date(),
      viewportSize: viewport || { width: 1920, height: 1080 },
      userAgent
    };
  }

  /**
   * Wait for dynamic content to load
   */
  private async waitForDynamicContent(): Promise<void> {
    if (!this.page) return;

    try {
      // Wait for common dynamic loading indicators to disappear
      await this.page.waitForFunction(
        () => {
          const doc = (globalThis as any).document;
          if (!doc) return true;
          const loadingElements = doc.querySelectorAll(
            '.loading, .spinner, .loader, [data-loading="true"]'
          );
          return loadingElements.length === 0;
        },
        { timeout: 5000 }
      ).catch(() => {
        // Continue if loading indicators don't disappear
        this.logger.debug('Dynamic content wait timeout - continuing');
      });

      // Additional wait for any remaining async operations
      await this.page.waitForTimeout(1000);

    } catch (error) {
      this.logger.debug('Dynamic content wait failed', error);
    }
  }

  /**
   * Interpolate URL with row data
   */
  private interpolateUrl(url: string, rowData?: CSVRow): string {
    if (!rowData) return url;

    let interpolatedUrl = url;
    
    // Replace {field} patterns with row data
    for (const [key, value] of Object.entries(rowData)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      interpolatedUrl = interpolatedUrl.replace(pattern, String(value));
    }

    return interpolatedUrl;
  }

  /**
   * Normalize extracted value based on field type
   */
  private normalizeExtractedValue(value: any, fieldType: string): any {
    if (value === null || value === undefined) return null;

    const stringValue = String(value).trim();
    if (stringValue === '') return null;

    switch (fieldType) {
      case 'number':
        const numValue = parseFloat(stringValue.replace(/[^0-9.-]/g, ''));
        return isNaN(numValue) ? null : numValue;
        
      case 'boolean':
        return stringValue.toLowerCase() === 'true' || stringValue === '1';
        
      case 'email':
        return stringValue.toLowerCase();
        
      case 'currency':
        const currencyValue = parseFloat(stringValue.replace(/[^0-9.-]/g, ''));
        return isNaN(currencyValue) ? null : currencyValue;
        
      default:
        return stringValue;
    }
  }

  /**
   * Check if resources have been cleaned up
   */
  isCleanedUp(): boolean {
    return this.cleanedUp;
  }

  /**
   * Cleanup browser resources (implements ManagedResource)
   */
  async cleanup(): Promise<void> {
    if (this.cleanedUp) {
      return;
    }

    try {
      this.logger.debug('Starting browser agent cleanup');

      // Cleanup OCR engine first
      if (this.ocrEngine) {
        await this.ocrEngine.cleanup();
        this.ocrEngine = null;
      }

      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.cleanedUp = true;
      this.logger.debug('Browser agent cleanup completed successfully');

    } catch (error) {
      this.logger.error('Error during browser agent cleanup', error);
      throw error;
    }
  }

  /**
   * Close browser and cleanup (legacy method)
   */
  async close(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Check if browser is initialized
   */
  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }
}