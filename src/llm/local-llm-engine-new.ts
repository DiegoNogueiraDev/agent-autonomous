import { access, constants } from 'fs/promises';
import { Logger } from '../core/logger.js';
import type {
  LLMSettings,
  ValidationDecisionRequest,
  ValidationDecisionResponse
} from '../types/index.js';

export interface LLMEngineOptions {
  settings: LLMSettings;
  enableFallback?: boolean;
  learningEnabled?: boolean;
  cacheEnabled?: boolean;
}

export interface ModelPerformance {
  avg_confidence: number;
  avg_processing_time_ms: number;
  total_decisions: number;
  high_confidence_rate: number;
}

export interface ModelInfo {
  name: string;
  description: string;
  memory_requirement_gb: number;
  strengths: string[];
  optimal_for: string[];
  is_loaded: boolean;
  is_current: boolean;
  performance: ModelPerformance;
}

/**
 * Local LLM Engine v2.0 - Sistema Multi-Modelo Inteligente
 * Integra com servidor Python para seleção automática de modelos
 * e sistema de aprendizado retroativo
 */
export class LocalLLMEngine {
  private logger: Logger;
  private settings: LLMSettings;
  private initialized: boolean = false;
  private requestCount: number = 0;
  private enableFallback: boolean;
  private learningEnabled: boolean;
  private cacheEnabled: boolean;
  private serverUrl: string = 'http://localhost:8000';
  private availableModels: ModelInfo[] = [];
  private fieldTypeMapping: Record<string, string> = {};

  constructor(options: LLMEngineOptions) {
    this.logger = Logger.getInstance();
    this.settings = options.settings;
    this.enableFallback = options.enableFallback ?? true;
    this.learningEnabled = options.learningEnabled ?? true;
    this.cacheEnabled = options.cacheEnabled ?? true;
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
   * Initialize the LLM engine with multi-model support
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('🤖 Inicializando Sistema Multi-Modelo LLM v2.0', {
        learningEnabled: this.learningEnabled,
        cacheEnabled: this.cacheEnabled,
        serverUrl: this.serverUrl,
        timestamp: new Date().toISOString()
      });

      // Check if LLM server is running
      this.logger.info('🔍 Verificando servidor LLM multi-modelo...');
      const serverHealthy = await this.checkLLMServer();

      if (!serverHealthy) {
        throw new Error('Servidor LLM não está disponível. Execute: python3 llm-server-production.py');
      }

      // Get available models and configuration
      await this.loadModelsConfiguration();

      this.initialized = true;
      this.logger.info('✅ Sistema Multi-Modelo LLM inicializado com sucesso', {
        availableModels: this.availableModels.length,
        fieldTypeMappings: Object.keys(this.fieldTypeMapping).length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('❌ Falha ao inicializar o sistema LLM', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Check if LLM server is running with multi-model support
   */
  private async checkLLMServer(): Promise<boolean> {
    const healthUrl = `${this.serverUrl}/health`;

    try {
      this.logger.debug(`🩺 Verificando saúde do servidor: ${healthUrl}`);

      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        this.logger.warn(`⚠️ Servidor retornou status ${response.status}`);
        return false;
      }

      const healthData = await response.json() as any;

      this.logger.info('✅ Servidor LLM multi-modelo está saudável', {
        status: healthData.status,
        modelsLoaded: healthData.models_loaded || [],
        modelsAvailable: healthData.models_available || [],
        currentModel: healthData.current_model,
        memoryUsage: healthData.memory_usage,
        availableMemory: healthData.available_memory_gb,
        requestCount: healthData.request_count,
        learningSystemEnabled: healthData.learning_system_enabled
      });

      return healthData.status === 'healthy' || healthData.models_available?.length > 0;

    } catch (error) {
      this.logger.error('💥 Erro ao verificar servidor LLM', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        url: healthUrl
      });
      return false;
    }
  }

  /**
   * Load models configuration and capabilities
   */
  private async loadModelsConfiguration(): Promise<void> {
    try {
      this.logger.info('📋 Carregando configuração de modelos...');

      const modelsUrl = `${this.serverUrl}/models`;
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`Erro ao obter configuração de modelos: ${response.status}`);
      }

      const modelsData = await response.json() as any;

      // Extract models information
      this.availableModels = modelsData.models || [];
      this.fieldTypeMapping = modelsData.field_type_mapping || {};

      this.logger.info('✅ Configuração de modelos carregada', {
        totalModels: this.availableModels.length,
        loadedModels: this.availableModels.filter(m => m.is_loaded).length,
        fieldTypeMappings: Object.keys(this.fieldTypeMapping).length,
        availableMemory: modelsData.available_memory_gb
      });

      // Log model capabilities
      this.availableModels.forEach(model => {
        this.logger.debug(`📚 Modelo ${model.name}: ${model.description}`, {
          strengths: model.strengths,
          optimalFor: model.optimal_for,
          isLoaded: model.is_loaded,
          performance: model.performance
        });
      });

    } catch (error) {
      this.logger.error('❌ Erro ao carregar configuração de modelos', {
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      throw error;
    }
  }

     /**
    * Select optimal model for field type
    */
   private selectModelForFieldType(fieldType: string): string | null {
     // Check direct mapping
     if (this.fieldTypeMapping[fieldType]) {
       const mappedModel = this.fieldTypeMapping[fieldType];
       this.logger.debug(`🎯 Modelo mapeado para ${fieldType}: ${mappedModel}`);
       return mappedModel || null;
     }

     // Fallback to models that handle this field type
     for (const model of this.availableModels) {
       if (model.optimal_for.includes(fieldType) && model.is_loaded) {
         this.logger.debug(`🔄 Modelo fallback para ${fieldType}: ${model.name}`);
         return model.name;
       }
     }

     // Last resort: use any loaded model
     const loadedModel = this.availableModels.find(m => m.is_loaded);
     if (loadedModel) {
       this.logger.debug(`⚡ Modelo padrão para ${fieldType}: ${loadedModel.name}`);
       return loadedModel.name;
     }

     return null;
   }

  /**
   * Make a validation decision using optimal model selection
   */
  async makeValidationDecision(request: ValidationDecisionRequest): Promise<ValidationDecisionResponse> {
    if (!this.initialized) {
      throw new Error('Sistema LLM não inicializado. Chame initialize() primeiro.');
    }

    this.requestCount++;
    const startTime = Date.now();

    try {
      this.logger.info('🤖 Fazendo decisão de validação com sistema multi-modelo', {
        fieldName: request.fieldName,
        fieldType: request.fieldType,
        requestId: this.requestCount,
        csvValuePreview: request.csvValue?.toString().substring(0, 50) + (request.csvValue?.toString().length > 50 ? '...' : ''),
        webValuePreview: request.webValue?.toString().substring(0, 50) + (request.webValue?.toString().length > 50 ? '...' : ''),
        timestamp: new Date().toISOString()
      });

      // Select optimal model for this field type
      const selectedModel = this.selectModelForFieldType(request.fieldType);
      if (!selectedModel) {
        throw new Error('Nenhum modelo adequado encontrado para o tipo de campo');
      }

      this.logger.debug(`🎯 Modelo selecionado: ${selectedModel} para tipo ${request.fieldType}`);

      // Make validation request to server
      const validationResponse = await this.makeServerValidationRequest(request, selectedModel);

      const processingTime = Date.now() - startTime;

      this.logger.info('✅ Decisão de validação concluída', {
        fieldName: request.fieldName,
        fieldType: request.fieldType,
        modelUsed: validationResponse.model_used || selectedModel,
        match: validationResponse.match,
        confidence: validationResponse.confidence,
        processingTime: `${processingTime}ms`,
        fromCache: validationResponse.from_cache || false,
        requestId: this.requestCount
      });

      // Convert server response to our format
      return {
        match: Boolean(validationResponse.match),
        confidence: Math.min(1.0, Math.max(0.0, parseFloat(validationResponse.confidence?.toString() || '0.5'))),
        reasoning: validationResponse.reasoning || 'Validação via sistema multi-modelo',
        normalizedCsvValue: validationResponse.csv_value || request.csvValue,
        normalizedWebValue: validationResponse.web_value || request.webValue,
        issues: validationResponse.from_cache ? ['Resultado do cache inteligente'] : undefined
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('💥 Falha ao fazer decisão de validação', {
        fieldName: request.fieldName,
        fieldType: request.fieldType,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        processingTime: `${processingTime}ms`,
        requestId: this.requestCount,
        timestamp: new Date().toISOString()
      });

             // Return fallback decision
       return this.createFallbackDecision(request, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Make validation request to server
   */
  private async makeServerValidationRequest(request: ValidationDecisionRequest, preferredModel?: string): Promise<any> {
    const validateUrl = `${this.serverUrl}/validate`;

    const payload = {
      csv_value: request.csvValue,
      web_value: request.webValue,
      field_type: request.fieldType,
      field_name: request.fieldName,
      preferred_model: preferredModel
    };

    this.logger.debug('📤 Enviando requisição de validação', {
      url: validateUrl,
      fieldName: request.fieldName,
      fieldType: request.fieldType,
      preferredModel,
      payloadSize: JSON.stringify(payload).length
    });

    const response = await fetch(validateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Servidor respondeu com ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json() as any;

    this.logger.debug('📥 Resposta de validação recebida', {
      status: response.status,
      match: responseData.match,
      confidence: responseData.confidence,
      modelUsed: responseData.model_used,
      fromCache: responseData.from_cache,
      processingTime: responseData.processing_time_ms
    });

    return responseData;
  }

  /**
   * Create fallback decision when server fails
   */
  private createFallbackDecision(request: ValidationDecisionRequest, error: Error): ValidationDecisionResponse {
    // Simple string comparison fallback
    const csvStr = String(request.csvValue).toLowerCase().trim();
    const webStr = String(request.webValue).toLowerCase().trim();
    const match = csvStr === webStr;

    this.logger.warn('🔄 Usando decisão de fallback local', {
      fieldName: request.fieldName,
      csvValue: csvStr.substring(0, 30),
      webValue: webStr.substring(0, 30),
      match,
      error: error.message
    });

    return {
      match,
      confidence: match ? 0.6 : 0.2, // Lower confidence for fallback
      reasoning: `Fallback local (servidor indisponível): ${error.message}`,
      normalizedCsvValue: csvStr,
      normalizedWebValue: webStr,
      issues: [`Sistema LLM indisponível: ${error.message}`]
    };
  }

  /**
   * Get system metrics and performance
   */
  async getMetrics(): Promise<any> {
    try {
      const metricsUrl = `${this.serverUrl}/metrics`;
      const response = await fetch(metricsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`Erro ao obter métricas: ${response.status}`);
      }

      const metrics = await response.json() as any;

      // Add local engine metrics
      metrics.local_engine = {
        initialized: this.initialized,
        request_count: this.requestCount,
        learning_enabled: this.learningEnabled,
        cache_enabled: this.cacheEnabled,
        available_models: this.availableModels.length,
        field_type_mappings: Object.keys(this.fieldTypeMapping).length
      };

      return metrics;
    } catch (error) {
      this.logger.warn('⚠️ Não foi possível obter métricas do servidor', {
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });

      return {
        local_engine: {
          initialized: this.initialized,
          request_count: this.requestCount,
          learning_enabled: this.learningEnabled,
          cache_enabled: this.cacheEnabled,
          server_available: false
        }
      };
    }
  }

  /**
   * Get available models information
   */
  getAvailableModels(): ModelInfo[] {
    return this.availableModels;
  }

  /**
   * Get field type to model mappings
   */
  getFieldTypeMapping(): Record<string, string> {
    return this.fieldTypeMapping;
  }

  /**
   * Generate text using the optimal model
   */
  async generate(prompt: string, maxTokens: number = 100, fieldType: string = 'text'): Promise<string> {
    if (!this.initialized) {
      throw new Error('Sistema LLM não inicializado. Chame initialize() primeiro.');
    }

    try {
      // Use validation endpoint with a simple comparison to generate text
      const response = await this.makeServerValidationRequest({
        csvValue: prompt,
        webValue: '',
        fieldType,
        fieldName: 'text_generation'
      });

      return response.reasoning || 'Texto gerado pelo sistema multi-modelo';
    } catch (error) {
      this.logger.error('❌ Falha ao gerar texto', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        prompt: prompt.substring(0, 50),
        fieldType
      });
      throw new Error(`Geração de texto falhou: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Batch validation decisions for multiple fields
   */
  async batchValidationDecisions(requests: ValidationDecisionRequest[]): Promise<ValidationDecisionResponse[]> {
    const results: ValidationDecisionResponse[] = [];

    this.logger.info('📦 Processando lote de validações', {
      batchSize: requests.length,
      timestamp: new Date().toISOString()
    });

    // Group requests by field type for optimal model usage
    const requestsByType = new Map<string, ValidationDecisionRequest[]>();
    requests.forEach(request => {
      const fieldType = request.fieldType;
      if (!requestsByType.has(fieldType)) {
        requestsByType.set(fieldType, []);
      }
      requestsByType.get(fieldType)!.push(request);
    });

    // Process each group with concurrency control
    const concurrency = 3;
    for (const [fieldType, groupRequests] of requestsByType) {
      this.logger.debug(`🔄 Processando grupo ${fieldType}: ${groupRequests.length} requisições`);

      for (let i = 0; i < groupRequests.length; i += concurrency) {
        const batch = groupRequests.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(request => this.makeValidationDecision(request))
        );
        results.push(...batchResults);
      }
    }

    this.logger.info('✅ Lote de validações concluído', {
      totalRequests: requests.length,
      successfulResults: results.length,
      averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    });

    return results;
  }

  /**
   * Check if the engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
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
      this.availableModels = [];
      this.fieldTypeMapping = {};
      this.logger.info('🧹 Sistema Multi-Modelo LLM limpo');
    } catch (error) {
      this.logger.error('❌ Erro durante limpeza do sistema LLM', {
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  }

  /**
   * Get engine statistics
   */
  getStatistics() {
    return {
      initialized: this.initialized,
      requestCount: this.requestCount,
      enableFallback: this.enableFallback,
      learningEnabled: this.learningEnabled,
      cacheEnabled: this.cacheEnabled,
      serverUrl: this.serverUrl,
      availableModels: this.availableModels.length,
      fieldTypeMappings: Object.keys(this.fieldTypeMapping).length,
      settings: {
        modelPath: this.settings.modelPath,
        contextSize: this.settings.contextSize,
        threads: this.settings.threads,
        temperature: this.settings.temperature
      }
    };
  }
}
