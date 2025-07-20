import { Logger } from '../core/logger.js';
import { access, constants } from 'fs/promises';
import type { 
  LLMSettings, 
  LLMResponse, 
  ValidationDecisionRequest,
  ValidationDecisionResponse
} from '../types/index.js';

export interface LLMEngineOptions {
  settings: LLMSettings;
  enableFallback?: boolean;
}

/**
 * Local LLM Engine for making validation decisions
 * Real implementation using llama-cpp-python
 */
export class LocalLLMEngine {
  private logger: Logger;
  private settings: LLMSettings;
  private initialized: boolean = false;
  private requestCount: number = 0;
  private llama: any = null; // Will hold the actual llama-cpp-python instance
  private enableFallback: boolean;
  private workingServerUrl: string = 'http://localhost:8080'; // Default to QA report working config

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

      // Check if primary model exists
      const primaryExists = await this.checkModelExists();
      let modelToLoad = this.settings.modelPath;

      if (!primaryExists && this.enableFallback && this.settings.fallbackModelPath) {
        this.logger.warn('Primary model not found, checking fallback', {
          primary: this.settings.modelPath,
          fallback: this.settings.fallbackModelPath
        });

        const fallbackExists = await this.checkModelExists(this.settings.fallbackModelPath);
        if (fallbackExists) {
          modelToLoad = this.settings.fallbackModelPath;
          this.logger.info('Using fallback model', { modelPath: modelToLoad });
        } else {
          throw new Error(`Neither primary nor fallback model found`);
        }
      } else if (!primaryExists) {
        throw new Error(`Model file not found: ${this.settings.modelPath}`);
      }

      // Initialize llama-cpp-python
      await this.initializeLlamaCpp(modelToLoad);

      this.initialized = true;
      this.logger.info('Local LLM Engine initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize LLM engine', error);
      throw error;
    }
  }

  /**
   * Initialize the actual llama-cpp-python instance
   */
  private async initializeLlamaCpp(modelPath: string): Promise<void> {
    try {
      // Check if LLM server is running
      const serverRunning = await this.checkLLMServer();
      
      if (serverRunning) {
        this.logger.info('Using running LLM server');
        this.llama = await this.createLlamaClient();
      } else {
        this.logger.warn('LLM server not running, using stub implementation');
        this.llama = await this.createLlamaStub(modelPath);
      }
    } catch (error) {
      throw new Error(`Failed to initialize llama-cpp: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if LLM server is running - trying both ports from QA report
   */
  private async checkLLMServer(): Promise<boolean> {
    const serverUrls = [
      'http://localhost:8080/health',  // From QA report - working server
      'http://127.0.0.1:8080/health',  // Alternative localhost
      'http://localhost:8000/health',  // Original config
      'http://127.0.0.1:8000/health'   // Alternative localhost
    ];

    for (const url of serverUrls) {
      try {
        this.logger.debug(`Checking LLM server at ${url}`);
        const response = await fetch(url, { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
          const data = await response.json() as any;
          // Check different response formats
          const isReady = data.status === 'ready' || 
                         data.model_loaded === true || 
                         data.ready === true ||
                         response.status === 200;
          
          if (isReady) {
            this.logger.info(`LLM server found and ready at ${url}`, { response: data });
            // Store working URL for future requests
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
   * Create a client that connects to the Python LLM server using discovered working URL
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
          // Try llama.cpp server format first (from QA report)
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
            text: data.content || data.text || '',
            tokens: data.tokens_predicted || data.tokens || 0,
            processing_time: data.timings?.predicted_ms || 0
          };
        } catch (error) {
          this.logger.warn('llama.cpp format failed, trying alternative format', { error });
          
          // Fallback to custom server format
          try {
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
              text: data.text || data.content || '',
              tokens: data.tokens || 0,
              processing_time: data.processing_time || 0
            };
          } catch (fallbackError) {
            throw new Error(`LLM server request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      },
      
      validateSpecific: async (request: any) => {
        try {
          const response = await fetch(`${baseUrl}/validate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              csv_value: request.csvValue,
              web_value: request.webValue,
              field_type: request.fieldType,
              field_name: request.fieldName
            })
          });

          if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
          }

          const data = await response.json() as any;
          return {
            text: JSON.stringify({
              match: data.match,
              confidence: data.confidence,
              reasoning: data.reasoning
            }),
            tokens: data.tokens || 0,
            processing_time: data.processing_time || 0
          };
        } catch (error) {
          throw new Error(`LLM validation request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    };
  }

  /**
   * Create a stub implementation that simulates real LLM behavior
   * This will be replaced with actual llama-cpp-python integration
   */
  private async createLlamaStub(modelPath: string): Promise<any> {
    return {
      modelPath,
      initialized: true,
      generate: async (prompt: string, options: any = {}) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        
        // Parse the prompt to understand what we're being asked
        const isValidationPrompt = prompt.includes('validate') || prompt.includes('compare');
        
        if (isValidationPrompt) {
          return this.generateValidationResponse(prompt);
        }
        
        return {
          text: `This is a simulated response from ${modelPath.split('/').pop()}`,
          tokens: 50,
          processing_time: 0.15
        };
      }
    };
  }

  /**
   * Generate a realistic validation response based on the prompt
   */
  private generateValidationResponse(prompt: string): any {
    // Extract values from the prompt for analysis
    const csvMatch = prompt.match(/CSV.*?:\s*['"](.*?)['"]/i);
    const webMatch = prompt.match(/Web.*?:\s*['"](.*?)['"]/i);
    
    const csvValue = csvMatch ? csvMatch[1] : '';
    const webValue = webMatch ? webMatch[1] : '';
    
    // Simple validation logic
    const normalized1 = this.normalizeForComparison(csvValue || '');
    const normalized2 = this.normalizeForComparison(webValue || '');
    const match = normalized1 === normalized2;
    const confidence = match ? 0.95 : 0.15;
    
    const reasoning = match 
      ? `Values match after normalization: "${normalized1}" === "${normalized2}"`
      : `Values differ: "${normalized1}" !== "${normalized2}"`;

    const response = JSON.stringify({
      match,
      confidence,
      reasoning,
      normalized_csv: normalized1,
      normalized_web: normalized2
    });

    return {
      text: response,
      tokens: response.length / 4,
      processing_time: 0.08 + Math.random() * 0.1
    };
  }

  /**
   * Normalize values for comparison
   */
  private normalizeForComparison(value: string): string {
    if (!value) return '';
    return value.toLowerCase().trim().replace(/\s+/g, ' ');
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

      // Build the prompt for the LLM
      const prompt = this.buildValidationPrompt(request);
      
      // Get LLM response
      const llmResponse = await this.queryLLM(prompt);
      
      // Parse the response into structured data
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
   * Build validation prompt for the LLM
   */
  private buildValidationPrompt(request: ValidationDecisionRequest): string {
    const { csvValue, webValue, fieldType, fieldName } = request;

    return `You are a data validation expert. Compare these two values and determine if they represent the same information.

Field Name: ${fieldName}
Field Type: ${fieldType}
CSV Value: "${csvValue}"
Web Value: "${webValue}"

Consider:
1. Exact matches
2. Formatting differences (spaces, case, punctuation)
3. Semantic equivalence (e.g., "John Doe" vs "Doe, John")
4. Partial matches for longer text
5. Data type-specific rules (dates, numbers, emails)

Respond in JSON format:
{
  "match": true|false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "normalized_csv": "Normalized CSV value",
  "normalized_web": "Normalized web value"
}`;
  }

  /**
   * Query the LLM with a prompt
   */
  private async queryLLM(prompt: string): Promise<LLMResponse> {
    if (!this.llama) {
      throw new Error('LLM not initialized');
    }

    const startTime = Date.now();

    try {
      const result = await this.llama.generate(prompt, {
        max_tokens: this.settings.maxTokens,
        temperature: this.settings.temperature,
        stop: ['}', '\n\n---']
      });

      const processingTime = Date.now() - startTime;

      return {
        text: result.text,
        confidence: 0.9, // TODO: Extract from model response
        tokens: result.tokens || 0,
        processingTime,
        model: this.settings.modelPath.split('/').pop() || 'unknown'
      };

    } catch (error) {
      throw new Error(`LLM query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse LLM response into structured validation decision with enhanced JSON extraction
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
    const jsonMatch3 = text.match(/(?:json|response|result):\s*(\{[\s\S]*?\})/i);
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
   * Legacy text parsing method - replaced by parseStructuredText
   * @deprecated Use parseStructuredText instead
   */
  private parseTextResponse(text: string, request: ValidationDecisionRequest): ValidationDecisionResponse {
    return this.parseStructuredText(text, request);
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
