import { BrowserAgent } from '../../src/automation/browser-agent';
import type { BrowserSettings, FieldMapping } from '../../src/types/index';

describe('BrowserAgent', () => {
  let browserAgent: BrowserAgent;
  const testSettings: BrowserSettings = {
    headless: true,
    viewport: { width: 1280, height: 720 },
    timeout: 30000,
    userAgent: 'DataHawk-Test/1.0'
  };

  beforeEach(() => {
    browserAgent = new BrowserAgent({ 
      settings: testSettings,
      headless: true 
    });
  });

  afterEach(async () => {
    if (browserAgent.isInitialized()) {
      await browserAgent.close();
    }
  });

  describe('Initialization', () => {
    test('should initialize browser successfully', async () => {
      await browserAgent.initialize();
      expect(browserAgent.isInitialized()).toBe(true);
    }, 30000);

    test('should handle initialization errors gracefully', async () => {
      // Create agent with invalid settings
      const invalidAgent = new BrowserAgent({
        settings: { ...testSettings, timeout: -1 }
      });

      await expect(invalidAgent.initialize()).rejects.toThrow();
    });
  });

  describe('Navigation', () => {
    beforeEach(async () => {
      await browserAgent.initialize();
    });

    test('should navigate to a simple webpage', async () => {
      const result = await browserAgent.navigateToUrl('https://example.com');
      
      expect(result.success).toBe(true);
      expect(result.finalUrl).toContain('example.com');
      expect(result.loadTime).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    }, 15000);

    test('should handle navigation failures', async () => {
      const result = await browserAgent.navigateToUrl('https://invalid-domain-that-does-not-exist.com');
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }, 15000);

    test('should interpolate URL parameters with row data', async () => {
      const rowData = { id: '123', name: 'test' };
      const result = await browserAgent.navigateToUrl('https://httpbin.org/json', rowData);
      
      expect(result.success).toBe(true);
      expect(result.finalUrl).toContain('httpbin.org');
    }, 15000);
  });

  describe('Data Extraction', () => {
    beforeEach(async () => {
      await browserAgent.initialize();
    });

    test('should extract basic page data', async () => {
      // Navigate to a simple test page
      await browserAgent.navigateToUrl('https://httpbin.org/html');
      
      const fieldMappings: FieldMapping[] = [
        {
          csvField: 'title',
          webSelector: 'h1',
          fieldType: 'text',
          required: true,
          validationStrategy: 'dom_extraction'
        }
      ];

      const extractedData = await browserAgent.extractWebData(fieldMappings);
      
      expect(extractedData.domData).toBeDefined();
      expect(extractedData.pageMetadata).toBeDefined();
      expect(extractedData.screenshots).toBeDefined();
      expect(extractedData.screenshots.length).toBeGreaterThan(0);
      expect(extractedData.extractionMethods).toBeDefined();
    }, 20000);

    test('should handle missing elements gracefully', async () => {
      await browserAgent.navigateToUrl('https://example.com');
      
      const fieldMappings: FieldMapping[] = [
        {
          csvField: 'nonexistent',
          webSelector: '#this-element-does-not-exist',
          fieldType: 'text',
          required: false,
          validationStrategy: 'dom_extraction'
        }
      ];

      const extractedData = await browserAgent.extractWebData(fieldMappings);
      
      expect(extractedData.domData.nonexistent).toBeNull();
      expect(extractedData.extractionMethods.nonexistent).toBe('dom_not_found');
      expect(extractedData.extractionConfidence.nonexistent).toBe(0);
    }, 15000);
  });

  describe('Screenshot Capture', () => {
    beforeEach(async () => {
      await browserAgent.initialize();
    });

    test('should capture page screenshots', async () => {
      await browserAgent.navigateToUrl('https://example.com');
      
      const screenshot = await browserAgent.captureScreenshot('test-page');
      
      expect(screenshot.id).toContain('screenshot_');
      expect(screenshot.base64Data).toBeDefined();
      expect(screenshot.base64Data.length).toBeGreaterThan(0);
      expect(screenshot.type).toBe('png');
      expect(screenshot.timestamp).toBeInstanceOf(Date);
    }, 15000);
  });

  describe('Browser Cleanup', () => {
    test('should close browser resources properly', async () => {
      await browserAgent.initialize();
      expect(browserAgent.isInitialized()).toBe(true);
      
      await browserAgent.close();
      expect(browserAgent.isInitialized()).toBe(false);
    }, 10000);

    test('should handle multiple close calls gracefully', async () => {
      await browserAgent.initialize();
      
      await browserAgent.close();
      await browserAgent.close(); // Should not throw
      
      expect(browserAgent.isInitialized()).toBe(false);
    });
  });
});