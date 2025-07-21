import { spawn } from 'child_process';
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
  private workingServerUrl: string = 'http://localhost:8000'; // Default server URL

  constructor(options: LLMEngineOptions) {
    this.logger = Logger.getInstance();
    this.settings = {
      ...options.settings,
      // Configurações otimizadas para modelos pequenos
      modelPath: options.settings.modelPath || './models/phi-3-mini-4k-instruct.Q4_K_M.gguf',
      contextSize: Math.min(options.settings.contextSize || 2048, 2048), // Máximo 2048 para estabilidade
      batchSize: Math.min(options.settings.batchSize || 128, 128), // Batch menor
      threads: Math.min(options.settings.threads || 3, 3), // Threads limitadas
      temperature: options.settings.temperature || 0.1,
      maxTokens: Math.min(options.settings.maxTokens || 10, 10) // Respostas muito curtas
    };
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
      this.logger.info('🔧 Inicializando Motor LLM Local', {
        modelPath: this.settings.modelPath,
        contextSize: this.settings.contextSize,
        threads: this.settings.threads,
        timestamp: new Date().toISOString()
      });

      // Check if LLM server is running
      this.logger.info('🔍 Verificando disponibilidade do servidor LLM...');
      const serverRunning = await this.checkLLMServer();

      if (serverRunning) {
        this.logger.info('✅ Servidor LLM encontrado e funcionando, conectando...', {
          serverUrl: this.workingServerUrl
        });
        this.llama = await this.createLlamaClient();
        this.initialized = true;
      } else {
        this.logger.warn('⚠️ Servidor LLM não encontrado, tentando iniciar automaticamente...');

        // Try to start the server automatically
        const serverStarted = await this.attemptToStartServer();

        if (serverStarted) {
          this.logger.info('🚀 Servidor LLM iniciado com sucesso, conectando...', {
            serverUrl: this.workingServerUrl
          });
          this.llama = await this.createLlamaClient();
          this.initialized = true;
        } else {
          const errorMsg = 'Servidor LLM não está rodando e falha ao iniciar automaticamente. Por favor, inicie manualmente com: python3 llm-server.py';
          this.logger.error('❌ ' + errorMsg);
          throw new Error(errorMsg);
        }
      }

      this.logger.info('✅ Motor LLM Local inicializado com sucesso', {
        serverUrl: this.workingServerUrl,
        initialized: this.initialized,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('❌ Falha ao inicializar o motor LLM', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Check if LLM server is running - trying multiple endpoints with retry logic
   */
  private async checkLLMServer(): Promise<boolean> {
    const serverUrls = [
      'http://localhost:8000/health',
      'http://127.0.0.1:8000/health',
      'http://localhost:8080/health',
      'http://127.0.0.1:8080/health'
    ];

    this.logger.info('🔍 Iniciando verificação de servidores LLM disponíveis', {
      urlsToCheck: serverUrls.length,
      maxAttempts: 3
    });

    // Retry logic with exponential backoff
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.info(`🔄 Tentativa ${attempt}/${maxAttempts} de encontrar servidor LLM`, {
        attempt,
        timestamp: new Date().toISOString()
      });

      for (const url of serverUrls) {
        try {
          this.logger.debug(`🌐 Verificando servidor LLM em: ${url}`);

          const startTime = Date.now();
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          const responseTime = Date.now() - startTime;

          this.logger.debug(`📡 Servidor em ${url} respondeu`, {
            status: response.status,
            responseTime: `${responseTime}ms`,
            ok: response.ok
          });

          if (response.ok) {
            const data = await response.json() as any;
            this.logger.debug(`📄 Resposta do servidor: ${JSON.stringify(data, null, 2)}`);

            const isReady = data.status === 'healthy' ||
              data.model_loaded === true ||
              response.status === 200;

            if (isReady) {
              this.logger.info(`✅ Servidor LLM encontrado e pronto!`, {
                url,
                responseTime: `${responseTime}ms`,
                modelLoaded: data.model_loaded,
                status: data.status,
                loadTime: data.load_time,
                requestCount: data.request_count
              });
              this.workingServerUrl = url.replace('/health', '');
              return true;
            } else {
              this.logger.warn(`⚠️ Servidor encontrado mas não está pronto`, {
                url,
                response: data
              });
            }
          } else {
            this.logger.warn(`❌ Servidor retornou erro HTTP`, {
              url,
              status: response.status,
              statusText: response.statusText
            });
          }
        } catch (error) {
          this.logger.debug(`💥 Erro ao verificar servidor em ${url}`, {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            type: error instanceof Error ? error.constructor.name : 'UnknownError'
          });
        }
      }

      // Wait before next attempt (exponential backoff)
      if (attempt < maxAttempts) {
        const delay = 1000 * attempt;
        this.logger.info(`⏱️ Aguardando ${delay}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.logger.error('❌ Nenhum servidor LLM funcional encontrado após todas as tentativas', {
      urlsTried: serverUrls,
      attempts: maxAttempts,
      timestamp: new Date().toISOString()
    });
    return false;
  }

  /**
   * Attempt to start the LLM server automatically
   */
  private async attemptToStartServer(): Promise<boolean> {
    try {
      this.logger.info('🚀 Tentando iniciar servidor LLM automaticamente...', {
        command: 'python3 llm-server.py',
        workingDirectory: process.cwd(),
        timestamp: new Date().toISOString()
      });

      // Check if the server script exists
      const serverScript = 'llm-server.py';
      try {
        await access(serverScript, constants.F_OK);
        this.logger.info('✅ Script do servidor LLM encontrado', { path: serverScript });
      } catch {
        this.logger.error('❌ Script do servidor LLM não encontrado', {
          expectedPath: serverScript,
          currentDir: process.cwd()
        });
        return false;
      }

      // Start the server process
      this.logger.info('🔧 Iniciando processo do servidor LLM...');
      const serverProcess = spawn('python3', ['llm-server.py'], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd()
      });

      this.logger.info('📝 Processo criado', {
        pid: serverProcess.pid,
        spawnfile: serverProcess.spawnfile
      });

      // Set up error handling for the process
      serverProcess.on('error', (error) => {
        this.logger.error('💥 Erro no processo do servidor LLM', {
          error: error.message,
          pid: serverProcess.pid
        });
      });

      serverProcess.on('exit', (code, signal) => {
        this.logger.warn('⚠️ Processo do servidor LLM terminou', {
          exitCode: code,
          signal,
          pid: serverProcess.pid
        });
      });

      // Don't keep the parent process alive
      serverProcess.unref();

      // Wait for the server to potentially start
      this.logger.info('⏱️ Aguardando inicialização do servidor LLM (5 segundos)...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if the server is now running
      this.logger.info('🔍 Verificando se o servidor iniciou com sucesso...');
      const serverRunning = await this.checkLLMServer();

      if (serverRunning) {
        this.logger.info('✅ Servidor LLM iniciado com sucesso automaticamente!', {
          serverUrl: this.workingServerUrl,
          pid: serverProcess.pid
        });
        return true;
      } else {
        this.logger.error('❌ Servidor LLM falhou ao iniciar ou não está pronto ainda', {
          pid: serverProcess.pid,
          timeWaited: '5 segundos'
        });

        // Try to kill the process if it's still running
        try {
          if (!serverProcess.killed) {
            serverProcess.kill();
            this.logger.info('🔪 Processo do servidor morto devido à falha de inicialização');
          }
        } catch (killError) {
          this.logger.warn('⚠️ Não foi possível matar o processo do servidor', {
            error: killError instanceof Error ? killError.message : 'Erro desconhecido'
          });
        }

        return false;
      }
    } catch (error) {
      this.logger.error('💥 Falha crítica ao tentar iniciar servidor LLM', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      return false;
    }
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

        this.logger.info('🔍 Iniciando validação específica', {
          fieldName: request.fieldName,
          fieldType: request.fieldType,
          csvValue: request.csvValue?.toString().substring(0, 100) + (request.csvValue?.toString().length > 100 ? '...' : ''),
          webValue: request.webValue?.toString().substring(0, 100) + (request.webValue?.toString().length > 100 ? '...' : ''),
          maxRetries
        });

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const url = `${baseUrl}/validate`;
            const payload = {
              csv_value: request.csvValue,
              web_value: request.webValue,
              field_type: request.fieldType,
              field_name: request.fieldName
            };

            this.logger.info(`🌐 Fazendo requisição de validação (tentativa ${attempt}/${maxRetries})`, {
              url,
              attempt,
              fieldName: request.fieldName,
              payloadSize: JSON.stringify(payload).length
            });

            // Add a small delay between retries
            if (attempt > 1) {
              const delay = 1000 * attempt;
              this.logger.info(`⏱️ Aguardando ${delay}ms antes da nova tentativa...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Check if server is still alive before making request
            this.logger.debug('🩺 Verificando saúde do servidor antes da requisição...');
            try {
              const healthStart = Date.now();
              const healthResponse = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
              });
              const healthTime = Date.now() - healthStart;

              if (!healthResponse.ok) {
                throw new Error(`Health check retornou status ${healthResponse.status}`);
              }

              const healthData = await healthResponse.json();
              this.logger.debug(`✅ Servidor saudável`, {
                responseTime: `${healthTime}ms`,
                modelLoaded: healthData.model_loaded,
                requestCount: healthData.request_count
              });
            } catch (healthError) {
              const errorMsg = `Servidor LLM não está respondendo aos health checks: ${healthError instanceof Error ? healthError.message : 'Erro desconhecido'}`;
              this.logger.error('💔 ' + errorMsg);
              throw new Error(errorMsg);
            }

            // Use dedicated /validate endpoint
            this.logger.debug('📤 Enviando requisição de validação...');
            const requestStart = Date.now();
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(15000) // Increased timeout to 15 seconds
            });
            const requestTime = Date.now() - requestStart;

            this.logger.debug(`📥 Resposta recebida`, {
              status: response.status,
              statusText: response.statusText,
              responseTime: `${requestTime}ms`,
              ok: response.ok
            });

            if (!response.ok) {
              throw new Error(`Servidor respondeu com ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;

            this.logger.info('✅ Validação concluída com sucesso', {
              attempt,
              responseTime: `${requestTime}ms`,
              match: data.match,
              confidence: data.confidence,
              reasoning: data.reasoning?.substring(0, 100)
            });

            // Ensure we have the expected format
            return {
              text: JSON.stringify({
                match: Boolean(data.match),
                confidence: Math.min(1.0, Math.max(0.0, parseFloat(data.confidence || 0.5))),
                reasoning: String(data.reasoning || 'Validação concluída')
              }),
              tokens: data.tokens || 0,
              processing_time: data.processing_time || 0
            };
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            this.logger.warn(`⚠️ Requisição de validação falhou (tentativa ${attempt}/${maxRetries})`, {
              error: lastError.message,
              errorType: lastError.constructor.name,
              url: `${baseUrl}/validate`,
              attempt,
              willRetry: attempt < maxRetries,
              fieldName: request.fieldName
            });

            // If this was the last attempt, break and throw
            if (attempt === maxRetries) {
              break;
            }

            // Continue to next retry
          }
        }

        // All retries failed
        this.logger.error('❌ Todas as tentativas de validação falharam', {
          error: lastError?.message,
          errorType: lastError?.constructor.name,
          url: `${baseUrl}/validate`,
          attempts: maxRetries,
          fieldName: request.fieldName,
          timestamp: new Date().toISOString()
        });

        if (lastError && lastError.name === 'AbortError') {
          const errorMsg = 'Requisição de validação LLM expirou após todas as tentativas';
          this.logger.error('⏰ ' + errorMsg);
          throw new Error(errorMsg);
        }

        if (lastError && lastError.message.includes('fetch failed')) {
          const errorMsg = `Requisição de validação LLM falhou: Não foi possível conectar ao servidor em ${baseUrl}/validate após ${maxRetries} tentativas`;
          this.logger.error('🔌 ' + errorMsg);
          throw new Error(errorMsg);
        }

        const errorMsg = `Requisição de validação LLM falhou após ${maxRetries} tentativas: ${lastError?.message || 'Erro desconhecido'}`;
        this.logger.error('💥 ' + errorMsg);
        throw new Error(errorMsg);
      }
    };
  }

  /**
   * Make a validation decision using the local LLM
   */
  async makeValidationDecision(request: ValidationDecisionRequest): Promise<ValidationDecisionResponse> {
    if (!this.initialized) {
      const errorMsg = 'Motor LLM não inicializado. Chame initialize() primeiro.';
      this.logger.error('❌ ' + errorMsg);
      throw new Error(errorMsg);
    }

    this.requestCount++;
    const startTime = Date.now();

    try {
      this.logger.info('🤖 Fazendo decisão de validação', {
        fieldName: request.fieldName,
        fieldType: request.fieldType,
        requestId: this.requestCount,
        csvValuePreview: request.csvValue?.toString().substring(0, 50) + (request.csvValue?.toString().length > 50 ? '...' : ''),
        webValuePreview: request.webValue?.toString().substring(0, 50) + (request.webValue?.toString().length > 50 ? '...' : ''),
        timestamp: new Date().toISOString()
      });

      // Use the dedicated validation endpoint
      this.logger.debug('📡 Chamando endpoint de validação específica...');
      const llmResponse = await this.llama.validateSpecific(request);

      // Parse the response
      this.logger.debug('🔄 Analisando resposta do LLM...');
      const decision = this.parseValidationResponse(llmResponse, request);

      const processingTime = Date.now() - startTime;
      this.logger.info('✅ Decisão de validação concluída', {
        fieldName: request.fieldName,
        match: decision.match,
        confidence: decision.confidence,
        processingTime: `${processingTime}ms`,
        requestId: this.requestCount,
        reasoning: decision.reasoning?.substring(0, 100)
      });

      return decision;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('💥 Falha ao fazer decisão de validação', {
        fieldName: request.fieldName,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        processingTime: `${processingTime}ms`,
        requestId: this.requestCount,
        timestamp: new Date().toISOString()
      });

      // Return a safe fallback decision
      const fallbackDecision = {
        match: false,
        confidence: 0.0,
        reasoning: `Erro durante validação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        normalizedCsvValue: request.csvValue,
        normalizedWebValue: request.webValue,
        issues: [`Erro de processamento LLM: ${error instanceof Error ? error.message : 'Erro desconhecido'}`]
      };

      this.logger.info('🔄 Retornando decisão de fallback', {
        fieldName: request.fieldName,
        fallbackDecision
      });

      return fallbackDecision;
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

    this.logger.debug('🔄 Analisando resposta do LLM', {
      textLength: text.length,
      textPreview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      tokens: llmResponse.tokens,
      processingTime: llmResponse.processingTime
    });

    try {
      // Try direct JSON parsing first
      this.logger.debug('📝 Tentando parsing direto de JSON...');
      const parsed = JSON.parse(text);
      this.logger.info('✅ JSON parseado com sucesso (método direto)', {
        keys: Object.keys(parsed),
        match: parsed.match,
        confidence: parsed.confidence
      });
      return this.buildValidationDecision(parsed, request);
    } catch (error) {
      this.logger.debug('⚠️ Parsing direto de JSON falhou, tentando métodos de extração', {
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });

      // Try to extract JSON from text using regex
      this.logger.debug('🔍 Tentando extrair JSON do texto...');
      const extractedJson = this.extractJsonFromText(text);
      if (extractedJson) {
        try {
          const parsed = JSON.parse(extractedJson);
          this.logger.info('✅ JSON extraído e parseado com sucesso', {
            extractedJson: extractedJson.substring(0, 100),
            keys: Object.keys(parsed)
          });
          return this.buildValidationDecision(parsed, request);
        } catch (e) {
          this.logger.debug('❌ Parsing de JSON extraído falhou', {
            extractedJson: extractedJson.substring(0, 100),
            error: e instanceof Error ? e.message : 'Erro desconhecido'
          });
        }
      }

      // Try fixing common JSON issues
      this.logger.debug('🔧 Tentando corrigir problemas comuns de JSON...');
      const fixedJson = this.fixCommonJsonIssues(text);
      if (fixedJson) {
        try {
          const parsed = JSON.parse(fixedJson);
          this.logger.info('✅ JSON corrigido e parseado com sucesso', {
            fixedJson: fixedJson.substring(0, 100),
            keys: Object.keys(parsed)
          });
          return this.buildValidationDecision(parsed, request);
        } catch (e) {
          this.logger.debug('❌ Parsing de JSON corrigido falhou', {
            fixedJson: fixedJson.substring(0, 100),
            error: e instanceof Error ? e.message : 'Erro desconhecido'
          });
        }
      }

      this.logger.warn('⚠️ Todos os métodos de parsing JSON falharam, usando parsing de texto estruturado', {
        originalText: text.substring(0, 100),
        error: error instanceof Error ? error.message : 'Erro desconhecido'
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
