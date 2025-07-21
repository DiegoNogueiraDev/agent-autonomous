import { chromium, Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import { Logger } from '../core/logger.js';
import { OCREngine } from '../ocr/ocr-engine.js';
import { ManagedResource, registerResource } from '../core/resource-manager.js';
import type { 
  BrowserSettings, 
  NavigationResult, 
  ExtractedWebData, 
  Screenshot, 
  PageMetadata,
  FieldMapping,
  CSVRow,
  OCRSettings,
  OCRResult
} from '../types/index.js';

export interface EnhancedBrowserAgentOptions {
  settings: BrowserSettings;
  ocrSettings: OCRSettings;
  headless?: boolean;
  slowMo?: number;
  recordVideo?: boolean;
  enableOCRFallback?: boolean;
}

/**
 * Enhanced Browser Agent with OCR fallback capability
 * Extends original BrowserAgent with intelligent OCR integration
 */
export class EnhancedBrowserAgent implements ManagedResource {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private logger: Logger;
  private settings: BrowserSettings;
  private ocrEngine: OCREngine;
  private enableOCRFallback: boolean;
  private resourceId: string;
  private isCleanedUpFlag: boolean = false;

  constructor(options: EnhancedBrowserAgentOptions) {
    this.logger = Logger.getInstance();
    this.settings = options.settings;
    this.enableOCRFallback = options.enableOCRFallback ?? true;
    this.ocrEngine = new OCREngine({ settings: options.ocrSettings });
    this.resourceId = `enhanced-browser-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Register this instance for automatic cleanup
    registerResource(this.resourceId, this);
  }

  /**
   * Initialize browser, context, and OCR engine
   */
  async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing enhanced browser agent');
      
      // Initialize browser
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

      // Create context with enhanced settings
      this.context = await this.browser.newContext({
        viewport: this.settings.viewport,
        userAgent: this.settings.userAgent,
        ignoreHTTPSErrors: true,
        // Additional settings for better element detection
        colorScheme: 'light',
        reducedMotion: 'reduce',
        forcedColors: 'none'
      });

      // Create page
      this.page = await this.context.newPage();

      // Initialize OCR engine if fallback is enabled
      if (this.enableOCRFallback) {
        await this.ocrEngine.initialize();
      }

      this.logger.info('Enhanced browser agent initialized successfully', {
        headless: this.settings.headless,
        viewport: this.settings.viewport,
        ocrEnabled: this.enableOCRFallback
      });

    } catch (error) {
      this.logger.error('Failed to initialize enhanced browser agent', error);
      throw error;
    }
  }

  /**
   * Navigate to URL with enhanced error handling
   */
  async navigate(url: string, rowData?: CSVRow): Promise<NavigationResult> {
    if (!this.page) throw new Error('Browser not initialized');

    const startTime = Date.now();
    const targetUrl = this.interpolateUrl(url, rowData);

    try {
      this.logger.debug('Navigating to URL', { url: targetUrl });

      const response = await this.page.goto(targetUrl, {
        waitUntil: 'networkidle',
        timeout: this.settings.timeout
      });

      const loadTime = Date.now() - startTime;
      const statusCode = response?.status() || 0;

      const result: NavigationResult = {
        success: statusCode >= 200 && statusCode < 400,
        url: targetUrl,
        statusCode,
        loadTime,
        redirectCount: 0,
        finalUrl: this.page.url(),
        errors: [],
        redirects: []
      };

      this.logger.info('Navigation completed', {
        url: targetUrl,
        status: statusCode,
        loadTime,
        redirectCount: result.redirectCount
      });

      return result;

    } catch (error) {
      const loadTime = Date.now() - startTime;
      this.logger.error('Navigation failed', { url: targetUrl, error, loadTime });
      
      return {
        success: false,
        url: targetUrl,
        statusCode: 0,
        loadTime,
        redirectCount: 0,
        finalUrl: targetUrl,
        errors: [error instanceof Error ? error.message : String(error)],
        redirects: []
      };
    }
  }

  /**
   * Extract data with DOM + OCR fallback strategy
   */
  async extractData(fieldMappings: FieldMapping[]): Promise<ExtractedWebData> {
    if (!this.page) throw new Error('Page not available');

    try {
      this.logger.debug('Starting enhanced data extraction', {
        fieldCount: fieldMappings.length,
        ocrFallbackEnabled: this.enableOCRFallback
      });

      const domData: Record<string, any> = {};
      const ocrData: Record<string, any> = {};
      const screenshots: Screenshot[] = [];
      const extractionMethods: Record<string, string> = {};
      const extractionConfidence: Record<string, number> = {};

      // Take full page screenshot first for OCR fallback
      const fullPageScreenshot = await this.takeScreenshot('full-page');
      screenshots.push(fullPageScreenshot);

      // Process each field mapping
      for (const mapping of fieldMappings) {
        const extractionResult = await this.extractFieldValueEnhanced(mapping);
        
        domData[mapping.csvField] = extractionResult.value;
        extractionMethods[mapping.csvField] = extractionResult.method;
        extractionConfidence[mapping.csvField] = extractionResult.confidence;

        // If DOM extraction failed and OCR is enabled, try OCR fallback
        if (extractionResult.confidence < 0.7 && this.enableOCRFallback) {
          const ocrResult = await this.performOCRFallback(mapping, fullPageScreenshot);
          
          if (ocrResult.success && ocrResult.confidence > extractionResult.confidence) {
            ocrData[mapping.csvField] = ocrResult.value;
            extractionMethods[mapping.csvField] = 'ocr_fallback';
            extractionConfidence[mapping.csvField] = ocrResult.confidence;
            
            this.logger.info('OCR fallback successful for field', {
              field: mapping.csvField,
              domConfidence: extractionResult.confidence,
              ocrConfidence: ocrResult.confidence
            });
          }
        }

        // Take element-specific screenshot if element found
        if (extractionResult.element) {
          const elementScreenshot = await this.takeElementScreenshot(
            extractionResult.element,
            `field-${mapping.csvField}`
          );
          screenshots.push(elementScreenshot);
        }
      }

      // Get page metadata
      const pageMetadata = await this.getPageMetadata();

      this.logger.info('Enhanced data extraction completed', {
        extractedFields: Object.keys(domData).length,
        ocrFallbackUsed: Object.keys(ocrData).length,
        screenshotsTaken: screenshots.length
      });

      return {
        domData,
        ocrData,
        screenshots,
        pageMetadata,
        extractionMethods: extractionMethods as Record<string, any>,
        extractionConfidence
      };

    } catch (error) {
      this.logger.error('Enhanced data extraction failed', error);
      throw error;
    }
  }

  /**
   * Enhanced field value extraction with better element detection
   */
  private async extractFieldValueEnhanced(mapping: FieldMapping): Promise<{
    value: any;
    method: string;
    confidence: number;
    element?: ElementHandle;
  }> {
    if (!this.page) throw new Error('Page not available');

    try {
      // Try multiple selectors in order of preference
      const selectors = this.generateAlternativeSelectors(mapping.webSelector);
      
      for (const selector of selectors) {
        try {
          const element = await this.page.$(selector);
          
          if (element) {
            const result = await this.extractValueFromElement(element, mapping);
            return {
              value: result.value,
              method: result.method,
              confidence: result.confidence,
              element
            };
          }
        } catch (error) {
          // Try next selector
          continue;
        }
      }

      // No element found with any selector
      return {
        value: null,
        method: 'dom_not_found',
        confidence: 0
      };

    } catch (error) {
      this.logger.error('Field extraction failed', { field: mapping.csvField, error });
      return {
        value: null,
        method: 'dom_error',
        confidence: 0
      };
    }
  }

  /**
   * Generate alternative selectors for better element detection
   */
  private generateAlternativeSelectors(originalSelector: string): string[] {
    const selectors = [originalSelector];
    
    // Add some common alternative patterns
    if (originalSelector.includes('#')) {
      // Try as class selector too
      selectors.push(originalSelector.replace('#', '.'));
    }
    
    if (originalSelector.includes('.')) {
      // Try as attribute selector
      const className = originalSelector.replace('.', '');
      selectors.push(`[class*="${className}"]`);
    }
    
    // Add fuzzy text-based selectors if it looks like text content
    if (!originalSelector.includes('[') && !originalSelector.includes('#') && !originalSelector.includes('.')) {
      selectors.push(`text=${originalSelector}`);
      selectors.push(`*:has-text("${originalSelector}")`);
    }

    return selectors;
  }

  /**
   * Extract value from element with enhanced detection
   */
  private async extractValueFromElement(element: ElementHandle, mapping: FieldMapping): Promise<{
    value: any;
    method: string;
    confidence: number;
  }> {
    try {
      const tagName = await element.evaluate(el => (el as Element).tagName.toLowerCase());
      let value: any;
      let method = 'dom_extraction';
      let confidence = 0.9;

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
          value = await element.inputValue();
          break;
          
        case 'textarea':
          value = await element.inputValue();
          break;
          
        default:
          // Try textContent first, then innerText
          value = await element.evaluate(el => {
            return el.textContent?.trim() || (el as any).innerText?.trim() || '';
          });
          break;
      }

      // Normalize the extracted value
      const normalizedValue = this.normalizeExtractedValue(value, mapping.fieldType);
      
      // Adjust confidence based on value quality
      if (normalizedValue === null || normalizedValue === '') {
        confidence = 0.1;
      } else if (this.validateFieldValue(normalizedValue, mapping.fieldType)) {
        confidence = 0.95;
      } else {
        confidence = 0.7;
      }

      return {
        value: normalizedValue,
        method,
        confidence
      };

    } catch (error) {
      this.logger.error('Error extracting value from element', error);
      return {
        value: null,
        method: 'dom_error',
        confidence: 0
      };
    }
  }

  /**
   * Perform OCR fallback for failed DOM extractions
   */
  private async performOCRFallback(mapping: FieldMapping, screenshot: Screenshot): Promise<{
    success: boolean;
    value: any;
    confidence: number;
  }> {
    try {
      this.logger.debug('Attempting OCR fallback', { field: mapping.csvField });

      // Convert screenshot to buffer for OCR processing
      const imageBuffer = Buffer.from(screenshot.data || screenshot.base64Data, 'base64');
      
      // Perform OCR extraction
      const ocrResult: OCRResult = await this.ocrEngine.extractText(imageBuffer);
      
      // Try to find relevant text based on field context
      const extractedValue = this.extractFieldFromOCRText(ocrResult.text, mapping);
      
      if (extractedValue) {
        const normalizedValue = this.normalizeExtractedValue(extractedValue, mapping.fieldType);
        const confidence = this.calculateOCRConfidence(ocrResult, normalizedValue, mapping);
        
        return {
          success: true,
          value: normalizedValue,
          confidence
        };
      }

      return {
        success: false,
        value: null,
        confidence: 0
      };

    } catch (error) {
      this.logger.error('OCR fallback failed', { field: mapping.csvField, error });
      return {
        success: false,
        value: null,
        confidence: 0
      };
    }
  }

  /**
   * Extract field value from OCR text using heuristics
   */
  private extractFieldFromOCRText(ocrText: string, mapping: FieldMapping): any {
    // Simple pattern matching based on field type
    const lines = ocrText.split('\n').map(line => line.trim()).filter(Boolean);
    
    switch (mapping.fieldType) {
      case 'email':
        const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        for (const line of lines) {
          const match = line.match(emailPattern);
          if (match) return match[0];
        }
        break;
        
      case 'phone':
        const phonePattern = /[\+]?[1-9]?[\d\s\-\(\)]{10,}/;
        for (const line of lines) {
          const match = line.match(phonePattern);
          if (match) return match[0].replace(/\D/g, '');
        }
        break;
        
      case 'currency':
        const currencyPattern = /[\$\€\£]?\s*[\d,]+\.?\d*/;
        for (const line of lines) {
          const match = line.match(currencyPattern);
          if (match) return match[0];
        }
        break;
        
      default:
        // For other types, look for patterns near field name
        const fieldName = mapping.csvField.toLowerCase();
        const contextLine = lines.find(line => 
          line.toLowerCase().includes(fieldName)
        );
        
        if (contextLine) {
          // Extract value after field name
          const parts = contextLine.split(/[:=]/);
          if (parts.length > 1) {
            return parts[1]?.trim();
          }
        }
        
        // Fallback to first non-empty line
        return lines[0] || null;
    }
    
    return null;
  }

  /**
   * Calculate confidence score for OCR extraction
   */
  private calculateOCRConfidence(ocrResult: OCRResult, extractedValue: any, mapping: FieldMapping): number {
    let confidence = ocrResult.confidence / 100; // Convert to 0-1 scale
    
    // Boost confidence if value matches field type validation
    if (this.validateFieldValue(extractedValue, mapping.fieldType)) {
      confidence = Math.min(confidence + 0.2, 1.0);
    }
    
    // Reduce confidence if value seems incomplete
    if (!extractedValue || String(extractedValue).length < 3) {
      confidence *= 0.5;
    }
    
    return confidence;
  }

  /**
   * Validate if extracted value matches expected field type
   */
  private validateFieldValue(value: any, fieldType: string): boolean {
    if (value === null || value === undefined) return false;
    
    const stringValue = String(value);
    
    switch (fieldType) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue);
      case 'phone':
        return /^\d{10,}$/.test(stringValue.replace(/\D/g, ''));
      case 'number':
        return !isNaN(Number(stringValue));
      case 'currency':
        return /^\d+\.?\d*$/.test(stringValue.replace(/[^\d.]/g, ''));
      default:
        return stringValue.length > 0;
    }
  }

  /**
   * Take element screenshot with proper element highlighting
   */
  private async takeElementScreenshot(element: ElementHandle, filename: string): Promise<Screenshot> {
    if (!this.page) throw new Error('Page not available');

    try {
      // Scroll element into view
      await element.scrollIntoViewIfNeeded();
      // Note: highlight() not available in all Playwright versions
      
      const boundingBox = await element.boundingBox();
      const screenshotBuffer = await element.screenshot({ type: 'png' });
      
      return {
        id: filename,
        filename,
        base64Data: screenshotBuffer.toString('base64'),
        data: screenshotBuffer.toString('base64'),
        timestamp: new Date(),
        quality: 90,
        type: 'element',
        boundingBox: boundingBox ? {
          x: Math.round(boundingBox.x),
          y: Math.round(boundingBox.y),
          width: Math.round(boundingBox.width),
          height: Math.round(boundingBox.height)
        } : undefined
      };

    } catch (error) {
      this.logger.error('Failed to take element screenshot', { filename, error });
      throw error;
    }
  }

  /**
   * Take full page screenshot
   */
  private async takeScreenshot(filename: string): Promise<Screenshot> {
    if (!this.page) throw new Error('Page not available');

    try {
      const screenshotBuffer = await this.page.screenshot({ 
        fullPage: true, 
        type: 'png' 
      });
      
      return {
        id: filename,
        filename,
        base64Data: screenshotBuffer.toString('base64'),
        data: screenshotBuffer.toString('base64'),
        timestamp: new Date(),
        quality: 90,
        type: 'full-page'
      };

    } catch (error) {
      this.logger.error('Failed to take screenshot', { filename, error });
      throw error;
    }
  }

  /**
   * Get enhanced page metadata
   */
  private async getPageMetadata(): Promise<PageMetadata> {
    if (!this.page) throw new Error('Page not available');

    try {
      const metadata = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          documentReady: document.readyState,
          elementCount: document.querySelectorAll('*').length,
          formCount: document.querySelectorAll('form').length,
          inputCount: document.querySelectorAll('input').length,
          linkCount: document.querySelectorAll('a').length
        };
      });

      return {
        url: metadata.url,
        title: metadata.title,
        userAgent: metadata.userAgent,
        loadTime: 0, // Will be set by caller
        timestamp: new Date(),
        viewportSize: metadata.viewport,
        loadState: await this.page.evaluate(() => document.readyState),
        viewport: metadata.viewport
      };

    } catch (error) {
      this.logger.error('Failed to get page metadata', error);
      return {
        title: '',
        url: this.page.url(),
        userAgent: '',
        loadTime: 0,
        viewportSize: { width: 0, height: 0 },
        viewport: { width: 0, height: 0 },
        timestamp: new Date(),
        loadState: 'unknown'
      };
    }
  }

  /**
   * URL interpolation with row data
   */
  private interpolateUrl(url: string, rowData?: CSVRow): string {
    if (!rowData) return url;

    let interpolatedUrl = url;
    
    for (const [key, value] of Object.entries(rowData)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      interpolatedUrl = interpolatedUrl.replace(pattern, String(value));
    }

    return interpolatedUrl;
  }

  /**
   * Enhanced value normalization
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
        
      case 'phone':
        return stringValue.replace(/\D/g, '');
        
      case 'currency':
        const currencyValue = parseFloat(stringValue.replace(/[^0-9.-]/g, ''));
        return isNaN(currencyValue) ? null : currencyValue;
        
      default:
        return stringValue;
    }
  }

  /**
   * Implementation of ManagedResource interface
   */
  async cleanup(): Promise<void> {
    if (this.isCleanedUpFlag) {
      return;
    }

    try {
      this.logger.debug('Starting enhanced browser agent cleanup', { resourceId: this.resourceId });
      
      // Close OCR engine first
      if (this.enableOCRFallback) {
        await this.ocrEngine.cleanup();
      }

      // Close browser resources
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

      this.isCleanedUpFlag = true;
      this.logger.debug('Enhanced browser agent cleanup completed successfully', { resourceId: this.resourceId });

    } catch (error) {
      this.logger.error('Error during enhanced browser agent cleanup', { resourceId: this.resourceId, error });
      throw error;
    }
  }

  /**
   * Implementation of ManagedResource interface
   */
  isCleanedUp(): boolean {
    return this.isCleanedUpFlag;
  }

  /**
   * Clean up resources including OCR engine (public alias for cleanup)
   */
  async close(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Check if browser and OCR are initialized
   */
  isInitialized(): boolean {
    const browserReady = this.browser !== null && this.page !== null;
    const ocrReady = !this.enableOCRFallback || this.ocrEngine.isInitialized();
    return browserReady && ocrReady;
  }

  /**
   * Get statistics about agent capabilities
   */
  getStats(): {
    browserReady: boolean;
    ocrReady: boolean;
    ocrEnabled: boolean;
  } {
    return {
      browserReady: this.browser !== null && this.page !== null,
      ocrReady: this.ocrEngine.isInitialized(),
      ocrEnabled: this.enableOCRFallback
    };
  }
}
