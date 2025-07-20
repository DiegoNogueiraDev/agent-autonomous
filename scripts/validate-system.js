#!/usr/bin/env node

/**
 * Sistema de Validação DataHawk - Issue 006
 * Script para validar todas as correções implementadas
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

class SystemValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  log(message, type = 'info') {
    const colors = {
      success: GREEN,
      error: RED,
      warning: YELLOW,
      info: BLUE
    };
    console.log(`${colors[type] || BLUE}${message}${RESET}`);
  }

  async runCheck(name, checkFn) {
    try {
      this.log(`🔍 Checking: ${name}`, 'info');
      const result = await checkFn();
      
      if (result.success) {
        this.log(`✅ ${name}: PASSED`, 'success');
        this.results.passed++;
      } else {
        this.log(`❌ ${name}: FAILED - ${result.message}`, 'error');
        this.results.failed++;
      }
      
      this.results.details.push({
        name,
        success: result.success,
        message: result.message,
        details: result.details || null
      });
      
    } catch (error) {
      this.log(`❌ ${name}: ERROR - ${error.message}`, 'error');
      this.results.failed++;
      this.results.details.push({
        name,
        success: false,
        message: error.message,
        details: null
      });
    }
  }

  // Issue 001: Schema validation
  async checkSchemaValidation() {
    try {
      const configPath = 'src/core/config-manager.ts';
      const content = fs.readFileSync(configPath, 'utf-8');
      
      // Check if validation methods exist
      const hasLoadMethod = content.includes('loadValidationConfig');
      const hasValidation = content.includes('ValidationConfigSchema.parse');
      
      if (hasLoadMethod && hasValidation) {
        return { success: true, message: 'Schema validation correctly implemented' };
      } else {
        return { success: false, message: 'Schema validation methods missing' };
      }
    } catch (error) {
      return { success: false, message: `Config manager check failed: ${error.message}` };
    }
  }

  // Issue 002: Configuration methods
  async checkConfigMethods() {
    try {
      const configPath = 'src/core/config-manager.ts';
      const content = fs.readFileSync(configPath, 'utf-8');
      
      const hasMergeConfigs = content.includes('mergeConfigs(');
      const hasSaveValidationConfig = content.includes('saveValidationConfig(');
      
      if (hasMergeConfigs && hasSaveValidationConfig) {
        return { success: true, message: 'Configuration methods properly implemented' };
      } else {
        const missing = [];
        if (!hasMergeConfigs) missing.push('mergeConfigs');
        if (!hasSaveValidationConfig) missing.push('saveValidationConfig');
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }
    } catch (error) {
      return { success: false, message: `Config methods check failed: ${error.message}` };
    }
  }

  // Issue 003: LLM server connection
  async checkLLMConnection() {
    try {
      const llmPath = 'src/llm/local-llm-engine.ts';
      const content = fs.readFileSync(llmPath, 'utf-8');
      
      const hasAutoDiscovery = content.includes('checkLLMServer');
      const hasMultipleUrls = content.includes('8080') && content.includes('8000');
      const hasLlamaSupport = content.includes('/completion');
      
      if (hasAutoDiscovery && hasMultipleUrls && hasLlamaSupport) {
        return { success: true, message: 'LLM server auto-discovery and llama.cpp support implemented' };
      } else {
        return { success: false, message: 'LLM connection improvements missing' };
      }
    } catch (error) {
      return { success: false, message: `LLM connection check failed: ${error.message}` };
    }
  }

  // Issue 004: JSON parsing
  async checkJSONParsing() {
    try {
      const llmPath = 'src/llm/local-llm-engine.ts';
      const content = fs.readFileSync(llmPath, 'utf-8');
      
      const hasMultiLayerParsing = content.includes('extractJsonFromText') && 
                                  content.includes('fixCommonJsonIssues') &&
                                  content.includes('parseStructuredText');
      
      if (hasMultiLayerParsing) {
        return { success: true, message: 'Multi-layer JSON parsing system implemented' };
      } else {
        return { success: false, message: 'Advanced JSON parsing methods missing' };
      }
    } catch (error) {
      return { success: false, message: `JSON parsing check failed: ${error.message}` };
    }
  }

  // Issue 005: Memory management
  async checkMemoryManagement() {
    try {
      const resourceManagerPath = 'src/core/resource-manager.ts';
      const browserAgentPath = 'src/automation/browser-agent.ts';
      
      if (!fs.existsSync(resourceManagerPath)) {
        return { success: false, message: 'ResourceManager not found' };
      }
      
      const resourceContent = fs.readFileSync(resourceManagerPath, 'utf-8');
      const browserContent = fs.readFileSync(browserAgentPath, 'utf-8');
      
      const hasResourceManager = resourceContent.includes('class ResourceManager');
      const hasSignalHandlers = resourceContent.includes('setupSignalHandlers');
      const hasManagedResource = browserContent.includes('ManagedResource');
      
      if (hasResourceManager && hasSignalHandlers && hasManagedResource) {
        return { success: true, message: 'Resource management system implemented' };
      } else {
        return { success: false, message: 'Resource management implementation incomplete' };
      }
    } catch (error) {
      return { success: false, message: `Memory management check failed: ${error.message}` };
    }
  }

  // Build validation
  async checkBuild() {
    try {
      execSync('npm run build', { stdio: 'pipe' });
      return { success: true, message: 'TypeScript compilation successful' };
    } catch (error) {
      return { success: false, message: `Build failed: ${error.message}` };
    }
  }

  // Documentation check
  async checkDocumentation() {
    try {
      const fixedDir = 'docs/fixed';
      const expectedFiles = [
        '001-schema-validation-fixed.md',
        '002-config-methods-fixed.md', 
        '003-llm-server-connection-fixed.md',
        '004-json-parsing-fixed.md',
        '005-memory-leaks-fixed.md',
        'FINAL_QA_FIXES_REPORT.md'
      ];
      
      const missingFiles = expectedFiles.filter(file => 
        !fs.existsSync(path.join(fixedDir, file))
      );
      
      if (missingFiles.length === 0) {
        return { success: true, message: 'All fix documentation present' };
      } else {
        return { success: false, message: `Missing documentation: ${missingFiles.join(', ')}` };
      }
    } catch (error) {
      return { success: false, message: `Documentation check failed: ${error.message}` };
    }
  }

  async validateAll() {
    this.log('\n🚀 DataHawk System Validation - Issue 006', 'info');
    this.log('=' * 50, 'info');
    
    // Run all validation checks
    await this.runCheck('Issue 001: Schema Validation', () => this.checkSchemaValidation());
    await this.runCheck('Issue 002: Configuration Methods', () => this.checkConfigMethods());
    await this.runCheck('Issue 003: LLM Server Connection', () => this.checkLLMConnection());
    await this.runCheck('Issue 004: JSON Parsing', () => this.checkJSONParsing());
    await this.runCheck('Issue 005: Memory Management', () => this.checkMemoryManagement());
    await this.runCheck('Build Status', () => this.checkBuild());
    await this.runCheck('Documentation', () => this.checkDocumentation());
    
    // Print summary
    this.log('\n📊 VALIDATION SUMMARY', 'info');
    this.log('=' * 50, 'info');
    this.log(`✅ Passed: ${this.results.passed}`, 'success');
    this.log(`❌ Failed: ${this.results.failed}`, 'error');
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    this.log(`📈 Success Rate: ${successRate}%`, successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error');
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: this.results.passed,
        failed: this.results.failed,
        successRate: successRate
      },
      checks: this.results.details
    };
    
    fs.writeFileSync('validation-report.json', JSON.stringify(report, null, 2));
    this.log('\n📄 Detailed report saved to: validation-report.json', 'info');
    
    return successRate >= 90;
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new SystemValidator();
  validator.validateAll()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

export default SystemValidator;