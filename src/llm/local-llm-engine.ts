import { access, constants } from 'fs/promises';
import { Logger } from '../core/logger.js';
import type {
  LLMResponse,
  LLMSettings,
  ValidationDecisionRequest,
  ValidationDecisionResponse
} from '../types/index.js';

export interface LLMEngineOptions {
  settings: LLMSettings;
  enableFallback?: boolean;
}

/**
 * Local LLM Engine for making validation decisions
 * Real implementation using llama-cpp-python server
 */
export class LocalLLMEngine {
  private logger: Logger;
  private settings: LLMSettings;
  private initialized: boolean = false;
  private requestCount: number = 0;
  private llama: any = null;
  private enableFallback: boolean;
  private workingServerUrl: string = 'http://localhost:8000'; // Default server URL

  constructor(options: LLMEngineOptions) {
    this.logger = Logger.getInstance();
    this.settings = options.settings;
    this.enableFallback = options.enableFallback ?? true;
  }

  /**
   * Check if the specified model file exists
   */
  async checkModelExists(modelPath?: string): Promise<boolean> {
    const path = modelPath || this.settings.modelPath;
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the LLM engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the LLM engine
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Local LLM Engine', {
        modelPath: this.settings.modelPath,
        contextSize: this.settings.contextSize,
        threads: this.settings.threads
      });

      // Check if LLM server is running
      const serverRunning = await this.checkLLMServer();

      if (serverRunning) {
        this.logger.info('Using running LLM server');
        this.llama = await this.createLlamaClient();
        this.initialized = true;
      } else {
        this.logger.warn('LLM server not running, will attempt to start it');
        throw new Error('LLM server not running. Please start it with: python3 llm-server.py');
      }

      this.logger.info('Local LLM Engine initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize LLM engine', error);
      throw error;
    }
  }

  /**
   * Check if LLM server is running - trying multiple endpoints
   */
  private async checkLLMServer(): Promise<boolean> {
    const serverUrls = [
      'http://localhost:8000/health',
      'http://127.0.0.1:8000/health',
      'http://localhost:8080/health',
      'http://127.0.0.1:8080/health'
    ];

    for (const url of serverUrls) {
      try {
        this.logger.debug(`Checking LLM server at ${url}`);
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (response.ok) {
          const data = await response.json() as any;
          const isReady = data.status === 'healthy' ||
            data.model_loaded === true ||
            response.status === 200;

          if (isReady) {
            this.logger.info(`LLM server found and ready at ${url}`, { response: data });
            this.workingServerUrl = url.replace('/health', '');
            return true;
          }
        }
      } catch (error) {
        this.logger.debug(`Failed to connect to ${url}`, { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    this.logger.warn('No working LLM server found on any of the attempted URLs');
    return false;
  }

  /**
   * Create a client that connects to the Python LLM server
   */
  private async createLlamaClient(): Promise<any> {
    const baseUrl = this.workingServerUrl;

    return {
      modelPath: this.settings.modelPath,
      initialized: true,
      isReal: true,
      baseUrl,

      generate: async (prompt: string, options: any = {}) => {
        try {
          // Use /generate endpoint (primary)
          const response = await fetch(`${baseUrl}/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prompt,
              max_tokens: options.max_tokens || this.settings.maxTokens,
              temperature: options.temperature || this.settings.temperature
            })
          });

          if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
          }

          const data = await response.json() as any;
          return {
            text: data.content || data.text || '',
            tokens: data.tokens_predicted || data.tokens || 0,
            processing_time: data.timings?.predicted_ms || 0
          };
        } catch (error) {
          this.logger.warn('Generate endpoint failed, trying completion', { error });

          // Fallback to /completion endpoint
          try {
            const response = await fetch(`${baseUrl}/completion`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                prompt,
                n_predict: options.max_tokens || this.settings.maxTokens,
                temperature: options.temperature || this.settings.temperature,
                stop: options.stop || ['\n'],
                stream: false
              })
            });

            if (!response.ok) {
              throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;
            return {
              text: data.choices?.[0]?.text || data.content || '',
              tokens: data.usage?.completion_tokens || data.tokens_predicted || 0,
              processing_time: data.timings?.predicted_ms || 0
            };
          } catch (fallbackError) {
            throw new Error(`LLM server request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      },

      validateSpecific: async (request: ValidationDecisionRequest) => {
        const maxRetries = 3;
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const url = `${baseUrl}/validate`;
            const payload = {
              csv_value: request.csvValue,
              web_value: request.webValue,
              field_type: request.fieldType,
              field_name: request.fieldName
            };
            
            this.logger.debug('Making validation request', { url, payload, attempt });
            
            // Add a small delay between retries
            if (attempt > 1) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
            
            // Check if server is still alive before making request
            try {
              const healthResponse = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
              });
              if (!healthResponse.ok) {
                throw new Error('Server health check failed');
              }
            } catch (healthError) {
              throw new Error(`LLM server is not responding to health checks: ${healthError instanceof Error ? healthError.message : 'Unknown error'}`);
            }
            
            // Use dedicated /validate endpoint
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(10000) // Reduced timeout to 10 seconds
            });

            if (!response.ok) {
              throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;

            // Ensure we have the expected format
            return {
              text: JSON.stringify({
                match: Boolean(data.match),
                confidence: Math.min(1.0, Math.max(0.0, parseFloat(data.confidence || 0.5))),
                reasoning: String(data.reasoning || 'Validation completed')
              }),
              tokens: data.tokens || 0,
              processing_time: data.processing_time || 0
            };
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            this.logger.warn(`Validation request failed (attempt ${attempt}/${maxRetries})`, { 
              error: lastError.message,
              url: `${baseUrl}/validate`,
              attempt,
              willRetry: attempt < maxRetries
            });
            
            // If this was the last attempt, break and throw
            if (attempt === maxRetries) {
              break;
            }
            
            // Continue to next retry
          }
        }
        
        // All retries failed
        this.logger.error('All validation request attempts failed', { 
          error: lastError?.message,
          url: `${baseUrl}/validate`,
          attempts: maxRetries
        });
        
        if (lastError && lastError.name === 'AbortError') {
          throw new Error('LLM validation request timed out after all retries');
        }
        
        if (lastError && lastError.message.includes('fetch failed')) {
          throw new Error(`LLM validation request failed: Unable to connect to server at ${baseUrl}/validate after ${maxRetries} attempts`);
        }
        
        throw new Error(`LLM validation request failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
      }
    };
  }

  /**
   * Make a validation decision using the local LLM
   */
  async makeValidationDecision(request: ValidationDecisionRequest): Promise<ValidationDecisionResponse> {
    if (!this.initialized) {
      throw new Error('LLM Engine not initialized. Call initialize() first.');
    }

    this.requestCount++;
    const startTime = Date.now();

    try {
      this.logger.debug('Making validation decision', {
        fieldName: request.fieldName,
        fieldType: request.fieldType,
        requestId: this.requestCount
      });

      // Use the dedicated validation endpoint
      const llmResponse = await this.llama.validateSpecific(request);

      // Parse the response
      const decision = this.parseValidationResponse(llmResponse, request);

      const processingTime = Date.now() - startTime;
      this.logger.debug('Validation decision completed', {
        fieldName: request.fieldName,
        match: decision.match,
        confidence: decision.confidence,
        processingTime
      });

      return decision;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Failed to make validation decision', {
        fieldName: request.fieldName,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      // Return a safe fallback decision
      return {
        match: false,
        confidence: 0.0,
        reasoning: `Error during validation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        normalizedCsvValue: request.csvValue,
        normalizedWebValue: request.webValue,
        issues: [`LLM processing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Parse LLM response into structured validation decision
   */
  private parseValidationResponse(
    llmResponse: LLMResponse,
    request: ValidationDecisionRequest
  ): ValidationDecisionResponse {
    const text = llmResponse.text;

    try {
      // Try direct JSON parsing first
      const parsed = JSON.parse(text);
      return this.buildValidationDecision(parsed, request);
    } catch (error) {
      this.logger.debug('Direct JSON parsing failed, trying extraction methods', { error });

      // Try to extract JSON from text using regex
      const extractedJson = this.extractJsonFromText(text);
      if (extractedJson) {
        try {
          const parsed = JSON.parse(extractedJson);
          return this.buildValidationDecision(parsed, request);
        } catch (e) {
          this.logger.debug('Extracted JSON parsing failed', { extractedJson, error: e });
        }
      }

      // Try fixing common JSON issues
      const fixedJson = this.fixCommonJsonIssues(text);
      if (fixedJson) {
        try {
          const parsed = JSON.parse(fixedJson);
          return this.buildValidationDecision(parsed, request);
        } catch (e) {
          this.logger.debug('Fixed JSON parsing failed', { fixedJson, error: e });
        }
      }

      this.logger.warn('All JSON parsing methods failed, falling back to text parsing', {
        originalText: text,
        error
      });

      // Fallback to structured text parsing
      return this.parseStructuredText(text, request);
    }
  }

  /**
   * Extract JSON from text using multiple regex patterns
   */
  private extractJsonFromText(text: string): string | null {
    // Pattern 1: Find JSON object with proper braces
    const jsonMatch1 = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch1) {
      return jsonMatch1[0];
    }

    // Pattern 2: Find JSON between code blocks
    const jsonMatch2 = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch2 && jsonMatch2[1]) {
      return jsonMatch2[1];
    }

    // Pattern 3: Find JSON after specific markers
    const jsonMatch3 = text.match(/(?:json|response|result)[\s:=]*(\{[\s\S]*?\})/i);
    if (jsonMatch3 && jsonMatch3[1]) {
      return jsonMatch3[1];
    }

    return null;
  }

  /**
   * Fix common JSON formatting issues
   */
  private fixCommonJsonIssues(text: string): string | null {
    let fixed = text.trim();

    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // Fix unquoted keys
    fixed = fixed.replace(/(\w+):/g, '"$1":');

    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');

    // Remove extra characters before/after braces
    const match = fixed.match(/\{[\s\S]*\}/);
    if (match) {
      return match[0];
    }

    return null;
  }

  /**
   * Build validation decision from parsed JSON object
   */
  private buildValidationDecision(parsed: any, request: ValidationDecisionRequest): ValidationDecisionResponse {
    return {
      match: Boolean(parsed.match),
      confidence: Math.min(1.0, Math.max(0.0, parseFloat(parsed.confidence || 0.5))),
      reasoning: parsed.reasoning || 'LLM validation decision',
      normalizedCsvValue: parsed.normalized_csv || request.csvValue,
      normalizedWebValue: parsed.normalized_web || request.webValue,
      issues: parsed.issues ? (Array.isArray(parsed.issues) ? parsed.issues : [parsed.issues]) : undefined
    };
  }

  /**
   * Parse structured text when JSON parsing fails completely
   */
  private parseStructuredText(text: string, request: ValidationDecisionRequest): ValidationDecisionResponse {
    try {
      // Look for key-value patterns in the text
      const patterns = {
        match: /(?:match|result)[\s:=]*(?:is\s+)?(true|false|yes|no)/i,
        confidence: /(?:confidence|score)[\s:=]*(?:is\s+)?([\d.]+)/i,
        reasoning: /(?:reasoning|explanation|because|reason)[\s:=]*(?:is\s+)?['""]?([^'""\n]+)/i
      };

      const match = this.extractFromPattern(text, patterns.match, (val) =>
        ['true', 'yes'].includes(val.toLowerCase())
      ) ?? false;

      const confidence = this.extractFromPattern(text, patterns.confidence, (val) =>
        Math.min(1.0, Math.max(0.0, parseFloat(val)))
      ) ?? 0.5;

      const reasoning = this.extractFromPattern(text, patterns.reasoning, (val) =>
        val.trim() || 'LLM structured text parsing'
      ) ?? 'LLM structured text parsing';

      return {
        match,
        confidence,
        reasoning,
        normalizedCsvValue: request.csvValue,
        normalizedWebValue: request.webValue,
        issues: ['Parsed from structured text - JSON parsing failed']
      };

    } catch (error) {
      this.logger.warn('Structured text parsing failed, using fallback', { error });
      return this.getFallbackDecision(request);
    }
  }

  /**
   * Extract value from text using pattern and transformer
   */
  private extractFromPattern<T>(text: string, pattern: RegExp, transformer: (value: string) => T | null): T | null {
    const match = text.match(pattern);
    if (match && match[1]) {
      try {
        return transformer(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Get fallback decision when LLM fails
   */
  private getFallbackDecision(request: ValidationDecisionRequest): ValidationDecisionResponse {
    // Simple string comparison fallback
    const csvStr = String(request.csvValue).toLowerCase().trim();
    const webStr = String(request.webValue).toLowerCase().trim();
    const match = csvStr === webStr;

    return {
      match,
      confidence: match ? 0.6 : 0.2, // Lower confidence for fallback
      reasoning: 'Fallback string comparison (LLM unavailable)',
      normalizedCsvValue: csvStr,
      normalizedWebValue: webStr,
      issues: ['LLM engine unavailable']
    };
  }

  /**
   * Generate text using the LLM
   */
  async generate(prompt: string, maxTokens: number = 100): Promise<string> {
    if (!this.initialized) {
      throw new Error('LLM Engine not initialized. Call initialize() first.');
    }

    if (!this.llama) {
      throw new Error('LLM not initialized');
    }

    try {
      const result = await this.llama.generate(prompt, {
        max_tokens: maxTokens,
        temperature: this.settings.temperature
      });

      return result.text || '';
    } catch (error) {
      this.logger.error('Failed to generate text', error);
      throw new Error(`Text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch validation decisions for multiple fields
   */
  async batchValidationDecisions(
    requests: ValidationDecisionRequest[]
  ): Promise<ValidationDecisionResponse[]> {
    const results: ValidationDecisionResponse[] = [];

    // Process in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(request => this.makeValidationDecision(request))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Close LLM engine and cleanup resources
   */
  async close(): Promise<void> {
    return this.cleanup();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.initialized = false;
      this.llama = null;
      this.logger.info('LLM Engine cleaned up');
    } catch (error) {
      this.logger.error('Error during LLM cleanup', error);
    }
  }

  /**
   * Get engine statistics
   */
  getStatistics() {
    return {
      initialized: this.initialized,
      requestCount: this.requestCount,
      modelPath: this.settings.modelPath,
      settings: {
        contextSize: this.settings.contextSize,
        threads: this.settings.threads,
        temperature: this.settings.temperature
      }
    };
  }
}
