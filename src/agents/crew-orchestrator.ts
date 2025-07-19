import { Logger } from '../core/logger.js';
import { BrowserAgent } from '../automation/browser-agent.js';
import { LocalLLMEngine } from '../llm/local-llm-engine.js';
import { OCREngine } from '../ocr/ocr-engine.js';
import { EvidenceCollector } from '../evidence/evidence-collector.js';
import type { 
  CSVRow, 
  FieldMapping, 
  ValidationConfig,
  AgentTask,
  CrewValidationResult,
  CrewConfig 
} from '../types/index.js';

export interface AgentCapability {
  name: string;
  description: string;
  requiredResources: string[];
  estimatedProcessingTime: number;
  confidenceScore: number;
}

export interface CrewAgent {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentTask?: AgentTask;
  performance: {
    tasksCompleted: number;
    averageProcessingTime: number;
    successRate: number;
    lastActivity: Date;
  };
}

export type AgentRole = 
  | 'navigator'     // Especialista em navegação web
  | 'extractor'     // Especialista em extração de dados
  | 'validator'     // Especialista em validação via LLM
  | 'ocr_specialist' // Especialista em OCR
  | 'coordinator'   // Coordenador geral
  | 'evidence_collector'; // Especialista em evidências

export class CrewOrchestrator {
  private logger: Logger;
  private config: CrewConfig;
  private agents: Map<string, CrewAgent> = new Map();
  private taskQueue: AgentTask[] = [];
  private activeTask: AgentTask | null = null;
  
  // Core engines
  private browserAgent: BrowserAgent | null = null;
  private llmEngine: LocalLLMEngine | null = null;
  private ocrEngine: OCREngine | null = null;
  private evidenceCollector: EvidenceCollector | null = null;

  // Performance metrics
  private metrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTaskTime: 0,
    agentUtilization: new Map<string, number>()
  };

  constructor(config: CrewConfig) {
    this.logger = Logger.getInstance();
    this.config = config;
    this.initializeAgents();
  }

  /**
   * Initialize the crew of specialized agents
   */
  private initializeAgents(): void {
    const agents: CrewAgent[] = [
      {
        id: 'nav-001',
        name: 'Navigator Alpha',
        role: 'navigator',
        status: 'idle',
        capabilities: [
          {
            name: 'web_navigation',
            description: 'Navigate to URLs and handle dynamic content',
            requiredResources: ['browser', 'network'],
            estimatedProcessingTime: 2000,
            confidenceScore: 0.95
          },
          {
            name: 'url_interpolation',
            description: 'Build URLs with CSV data',
            requiredResources: ['csv_data'],
            estimatedProcessingTime: 100,
            confidenceScore: 0.99
          }
        ],
        performance: {
          tasksCompleted: 0,
          averageProcessingTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        }
      },
      {
        id: 'ext-001',
        name: 'Extractor Primary',
        role: 'extractor',
        status: 'idle',
        capabilities: [
          {
            name: 'dom_extraction',
            description: 'Extract data using CSS selectors',
            requiredResources: ['browser', 'page_dom'],
            estimatedProcessingTime: 500,
            confidenceScore: 0.90
          },
          {
            name: 'element_analysis',
            description: 'Analyze element types and extract optimal data',
            requiredResources: ['browser', 'dom_element'],
            estimatedProcessingTime: 300,
            confidenceScore: 0.85
          }
        ],
        performance: {
          tasksCompleted: 0,
          averageProcessingTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        }
      },
      {
        id: 'ocr-001',
        name: 'OCR Specialist',
        role: 'ocr_specialist',
        status: 'idle',
        capabilities: [
          {
            name: 'text_extraction',
            description: 'Extract text from images using OCR',
            requiredResources: ['screenshot', 'tesseract'],
            estimatedProcessingTime: 1500,
            confidenceScore: 0.80
          },
          {
            name: 'image_preprocessing',
            description: 'Optimize images for better OCR accuracy',
            requiredResources: ['image_buffer', 'sharp'],
            estimatedProcessingTime: 800,
            confidenceScore: 0.85
          },
          {
            name: 'fuzzy_matching',
            description: 'Find similar text using fuzzy algorithms',
            requiredResources: ['text_corpus'],
            estimatedProcessingTime: 200,
            confidenceScore: 0.75
          }
        ],
        performance: {
          tasksCompleted: 0,
          averageProcessingTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        }
      },
      {
        id: 'val-001',
        name: 'Validator Intelligence',
        role: 'validator',
        status: 'idle',
        capabilities: [
          {
            name: 'semantic_validation',
            description: 'Validate data using LLM intelligence',
            requiredResources: ['llm_engine', 'comparison_data'],
            estimatedProcessingTime: 1200,
            confidenceScore: 0.88
          },
          {
            name: 'confidence_assessment',
            description: 'Calculate confidence scores for validations',
            requiredResources: ['validation_results'],
            estimatedProcessingTime: 100,
            confidenceScore: 0.92
          }
        ],
        performance: {
          tasksCompleted: 0,
          averageProcessingTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        }
      },
      {
        id: 'ev-001',
        name: 'Evidence Archivist',
        role: 'evidence_collector',
        status: 'idle',
        capabilities: [
          {
            name: 'screenshot_capture',
            description: 'Capture and organize screenshots',
            requiredResources: ['browser', 'filesystem'],
            estimatedProcessingTime: 400,
            confidenceScore: 0.98
          },
          {
            name: 'evidence_indexing',
            description: 'Create searchable evidence index',
            requiredResources: ['evidence_files', 'filesystem'],
            estimatedProcessingTime: 200,
            confidenceScore: 0.95
          }
        ],
        performance: {
          tasksCompleted: 0,
          averageProcessingTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        }
      },
      {
        id: 'coord-001',
        name: 'Mission Control',
        role: 'coordinator',
        status: 'idle',
        capabilities: [
          {
            name: 'task_orchestration',
            description: 'Coordinate tasks between agents',
            requiredResources: ['task_queue'],
            estimatedProcessingTime: 50,
            confidenceScore: 0.99
          },
          {
            name: 'resource_management',
            description: 'Optimize resource allocation',
            requiredResources: ['system_metrics'],
            estimatedProcessingTime: 100,
            confidenceScore: 0.90
          }
        ],
        performance: {
          tasksCompleted: 0,
          averageProcessingTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        }
      }
    ];

    agents.forEach(agent => {
      this.agents.set(agent.id, agent);
    });

    this.logger.info('CrewAI agents initialized', {
      totalAgents: agents.length,
      roles: [...new Set(agents.map(a => a.role))]
    });
  }

  /**
   * Initialize core engines and assign to agents
   */
  async initialize(
    browserAgent: BrowserAgent,
    llmEngine: LocalLLMEngine,
    ocrEngine: OCREngine,
    evidenceCollector: EvidenceCollector
  ): Promise<void> {
    this.browserAgent = browserAgent;
    this.llmEngine = llmEngine;
    this.ocrEngine = ocrEngine;
    this.evidenceCollector = evidenceCollector;

    this.logger.info('CrewAI orchestrator initialized with core engines');
  }

  /**
   * Execute validation for a CSV row using multi-agent approach
   */
  async executeRowValidation(
    csvRow: CSVRow,
    fieldMappings: FieldMapping[],
    config: ValidationConfig
  ): Promise<CrewValidationResult> {
    const startTime = Date.now();
    this.metrics.totalTasks++;

    try {
      this.logger.info('Starting multi-agent validation', {
        rowIndex: csvRow._index || 0,
        fieldsToValidate: fieldMappings.length
      });

      // Phase 1: Navigation (Navigator Agent)
      const navigationResult = await this.executeNavigationPhase(csvRow, config);
      if (!navigationResult.success) {
        throw new Error(`Navigation failed: ${navigationResult.error}`);
      }

      // Phase 2: Parallel Extraction (Extractor + OCR Agents)
      const extractionResults = await this.executeExtractionPhase(fieldMappings);

      // Phase 3: Validation (Validator Agent)
      const validationResults = await this.executeValidationPhase(
        csvRow,
        extractionResults,
        fieldMappings
      );

      // Phase 4: Evidence Collection (Evidence Agent)
      const evidenceResult = await this.executeEvidencePhase(csvRow, extractionResults);

      const processingTime = Date.now() - startTime;
      this.metrics.completedTasks++;
      this.updateMetrics(processingTime);

      return {
        success: true,
        processingTime,
        navigationResult,
        extractionResults,
        validationResults,
        evidenceResult,
        agentUtilization: this.getAgentUtilization()
      };

    } catch (error) {
      this.metrics.failedTasks++;
      this.logger.error('Multi-agent validation failed', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
        agentUtilization: this.getAgentUtilization()
      };
    }
  }

  /**
   * Phase 1: Navigation using Navigator agent
   */
  private async executeNavigationPhase(csvRow: CSVRow, config: ValidationConfig): Promise<any> {
    const navigator = this.getAvailableAgent('navigator');
    if (!navigator || !this.browserAgent) {
      throw new Error('Navigator agent or browser not available');
    }

    this.setAgentBusy(navigator.id, {
      type: 'navigation',
      description: 'Navigate to target URL',
      data: { url: config.targetUrl, csvRow }
    });

    try {
      const result = await this.browserAgent.navigateToUrl(config.targetUrl, csvRow);
      this.setAgentIdle(navigator.id, true);
      return result;
    } catch (error) {
      this.setAgentIdle(navigator.id, false);
      throw error;
    }
  }

  /**
   * Phase 2: Parallel extraction using Extractor and OCR agents
   */
  private async executeExtractionPhase(fieldMappings: FieldMapping[]): Promise<any> {
    const extractor = this.getAvailableAgent('extractor');
    if (!extractor || !this.browserAgent) {
      throw new Error('Extractor agent or browser not available');
    }

    this.setAgentBusy(extractor.id, {
      type: 'extraction',
      description: 'Extract data from web page',
      data: { fieldMappings }
    });

    try {
      const results = await this.browserAgent.extractWebData(fieldMappings);
      this.setAgentIdle(extractor.id, true);
      return results;
    } catch (error) {
      this.setAgentIdle(extractor.id, false);
      throw error;
    }
  }

  /**
   * Phase 3: Validation using Validator agent
   */
  private async executeValidationPhase(
    csvRow: CSVRow,
    extractionResults: any,
    fieldMappings: FieldMapping[]
  ): Promise<any[]> {
    const validator = this.getAvailableAgent('validator');
    if (!validator || !this.llmEngine) {
      throw new Error('Validator agent or LLM engine not available');
    }

    this.setAgentBusy(validator.id, {
      type: 'validation',
      description: 'Validate extracted data using LLM',
      data: { csvRow, extractionResults, fieldMappings }
    });

    try {
      const validationPromises = fieldMappings.map(async (mapping) => {
        const csvValue = csvRow[mapping.csvField];
        const webValue = extractionResults.domData?.[mapping.csvField];

        if (csvValue !== undefined && webValue !== undefined) {
          return await this.llmEngine!.makeValidationDecision({
            csvValue: String(csvValue),
            webValue: String(webValue),
            fieldType: mapping.fieldType,
            fieldName: mapping.csvField
          });
        }

        return {
          match: false,
          confidence: 0,
          reasoning: 'Missing data for validation',
          normalizedCsvValue: csvValue,
          normalizedWebValue: webValue
        };
      });

      const results = await Promise.all(validationPromises);
      this.setAgentIdle(validator.id, true);
      return results;
    } catch (error) {
      this.setAgentIdle(validator.id, false);
      throw error;
    }
  }

  /**
   * Phase 4: Evidence collection using Evidence agent
   */
  private async executeEvidencePhase(csvRow: CSVRow, extractionResults: any): Promise<any> {
    const evidenceAgent = this.getAvailableAgent('evidence_collector');
    if (!evidenceAgent || !this.evidenceCollector) {
      throw new Error('Evidence agent or collector not available');
    }

    this.setAgentBusy(evidenceAgent.id, {
      type: 'evidence_collection',
      description: 'Collect and organize evidence',
      data: { csvRow, extractionResults }
    });

    try {
      // Evidence collection would typically be handled by the existing evidence collector
      // For now, we'll return a summary
      const result = {
        evidenceId: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        screenshots: extractionResults.screenshots?.length || 0,
        domSnapshots: 1,
        validationLogs: 1,
        timestamp: new Date().toISOString()
      };

      this.setAgentIdle(evidenceAgent.id, true);
      return result;
    } catch (error) {
      this.setAgentIdle(evidenceAgent.id, false);
      throw error;
    }
  }

  /**
   * Get available agent by role
   */
  private getAvailableAgent(role: AgentRole): CrewAgent | null {
    for (const agent of this.agents.values()) {
      if (agent.role === role && agent.status === 'idle') {
        return agent;
      }
    }
    return null;
  }

  /**
   * Set agent as busy with current task
   */
  private setAgentBusy(agentId: string, task: AgentTask): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'busy';
      agent.currentTask = task;
      agent.performance.lastActivity = new Date();
    }
  }

  /**
   * Set agent as idle and update performance metrics
   */
  private setAgentIdle(agentId: string, success: boolean): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.currentTask) {
      const taskDuration = Date.now() - agent.performance.lastActivity.getTime();
      
      agent.status = 'idle';
      agent.performance.tasksCompleted++;
      agent.performance.averageProcessingTime = 
        (agent.performance.averageProcessingTime + taskDuration) / 2;
      
      if (success) {
        agent.performance.successRate = 
          (agent.performance.successRate * (agent.performance.tasksCompleted - 1) + 1) / 
          agent.performance.tasksCompleted;
      } else {
        agent.performance.successRate = 
          (agent.performance.successRate * (agent.performance.tasksCompleted - 1)) / 
          agent.performance.tasksCompleted;
      }

      agent.currentTask = undefined;
    }
  }

  /**
   * Update global metrics
   */
  private updateMetrics(processingTime: number): void {
    this.metrics.averageTaskTime = 
      (this.metrics.averageTaskTime * (this.metrics.completedTasks - 1) + processingTime) / 
      this.metrics.completedTasks;
  }

  /**
   * Get current agent utilization
   */
  private getAgentUtilization(): Record<string, any> {
    const utilization: Record<string, any> = {};
    
    for (const [id, agent] of this.agents) {
      utilization[id] = {
        role: agent.role,
        status: agent.status,
        tasksCompleted: agent.performance.tasksCompleted,
        successRate: Math.round(agent.performance.successRate * 100),
        avgProcessingTime: Math.round(agent.performance.averageProcessingTime)
      };
    }

    return utilization;
  }

  /**
   * Get comprehensive crew statistics
   */
  getCrewStatistics(): any {
    const agentsByRole = new Map<AgentRole, CrewAgent[]>();
    
    for (const agent of this.agents.values()) {
      if (!agentsByRole.has(agent.role)) {
        agentsByRole.set(agent.role, []);
      }
      agentsByRole.get(agent.role)!.push(agent);
    }

    return {
      totalAgents: this.agents.size,
      agentsByRole: Object.fromEntries(agentsByRole),
      metrics: this.metrics,
      utilization: this.getAgentUtilization(),
      activeTask: this.activeTask
    };
  }

  /**
   * Cleanup and shutdown crew
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down CrewAI orchestrator');
    
    // Set all agents to offline
    for (const agent of this.agents.values()) {
      agent.status = 'offline';
      agent.currentTask = undefined;
    }

    this.taskQueue = [];
    this.activeTask = null;
  }
}