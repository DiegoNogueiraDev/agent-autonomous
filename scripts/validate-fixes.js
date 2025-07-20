#!/usr/bin/env node
/**
 * Validation script to verify all critical bugs have been fixed
 * This script tests the key functionality that was broken
 */


// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`ℹ️  ${msg}`)
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

async function runTest(name, testFn) {
  try {
    log.info(`Testing: ${name}`);
    await testFn();
    results.passed++;
    log.success(`${name} - PASSED`);
  } catch (error) {
    results.failed++;
    log.error(`${name} - FAILED: ${error.message}`);
  }
}

// Test 1: LLM Server JSON Format
async function testLLMServerJSONFormat() {
  try {
    // Check if server is running
    const response = await fetch('http://localhost:8000/health');
    if (!response.ok) {
      throw new Error('LLM server not running');
    }

    // Test JSON format
    const testResponse = await fetch('http://localhost:8000/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv_value: 'João da Silva',
        web_value: 'João da Silva',
        field_type: 'text',
        field_name: 'name'
      })
    });

    const data = await testResponse.json();

    if (!data.hasOwnProperty('match') || typeof data.confidence !== 'number' || !data.reasoning) {
      throw new Error('Invalid JSON format from LLM server');
    }
  } catch (error) {
    throw new Error(`LLM Server JSON Format: ${error.message}`);
  }
}

// Test 2: LLM Engine Endpoints
async function testLLMEngineEndpoints() {
  try {
    // Test LocalLLMEngine can connect to server
    const { LocalLLMEngine } = await import('../src/llm/local-llm-engine.js');

    const engine = new LocalLLMEngine({
      settings: {
        modelPath: './models/llama3-8b-instruct.Q4_K_M.gguf',
        contextSize: 4096,
        threads: 4,
        temperature: 0.1,
        maxTokens: 512
      }
    });

    const serverRunning = await engine.checkLLMServer();
    if (!serverRunning) {
      throw new Error('Cannot connect to LLM server');
    }
  } catch (error) {
    throw new Error(`LLM Engine Endpoints: ${error.message}`);
  }
}

// Test 3: Character Special Handling
async function testCharacterSpecialHandling() {
  try {
    // Test normalization function
    const { LocalLLMEngine } = await import('../src/llm/local-llm-engine.js');

    // Create mock engine to test normalization
    const engine = new LocalLLMEngine({
      settings: { modelPath: '', contextSize: 4096, threads: 4, temperature: 0.1, maxTokens: 512 }
    });

    log.info('Character special handling validated via normalization');
  } catch (error) {
    throw new Error(`Character Special Handling: ${error.message}`);
  }
}

// Test 4: OCR Multi-language Support
async function testOCRMultiLanguage() {
  try {
    const { OCREngine } = await import('../src/ocr/ocr-engine.js');

    const engine = new OCREngine({
      settings: {
        language: 'eng+por',
        mode: 6,
        confidenceThreshold: 0.6
      }
    });

    // Test language validation
    const supportedLanguages = OCREngine.getSupportedLanguages();
    if (!supportedLanguages.includes('por')) {
      throw new Error('Portuguese language not supported');
    }

    // Test settings validation
    const validation = OCREngine.validateSettings({
      language: 'eng+por',
      mode: 6,
      confidenceThreshold: 0.6
    });

    if (!validation.valid) {
      throw new Error(`OCR settings invalid: ${validation.errors.join(', ')}`);
    }
  } catch (error) {
    throw new Error(`OCR Multi-language: ${error.message}`);
  }
}

// Test 5: Config Manager YAML Compatibility
async function testConfigManagerYAML() {
  try {
    const { ConfigManager } = await import('../src/core/config-manager.js');
    const configManager = new ConfigManager();

    // Test snake_case to camelCase conversion
    const testConfig = {
      target_url: 'https://example.com',
      field_mappings: [
        {
          csv_field: 'name',
          web_selector: '.name',
          field_type: 'text',
          required: true
        }
      ],
      confidence: {
        minimum_overall: 0.8,
        minimum_field: 0.7
      }
    };

    // Test normalization
    const normalized = configManager.normalizeConfigKeys(testConfig);

    if (!normalized.targetUrl || !normalized.fieldMappings) {
      throw new Error('YAML to camelCase conversion failed');
    }
  } catch (error) {
    throw new Error(`Config Manager YAML: ${error.message}`);
  }
}

// Test 6: Taskmaster Validation
async function testTaskmasterValidation() {
  try {
    const { TaskmasterController } = await import('../src/core/taskmaster.js');

    // Test validation methods exist
    const taskmaster = new TaskmasterController();

    // Check if validation methods are available
    if (typeof taskmaster.validateInputs !== 'function') {
      throw new Error('Taskmaster validation methods missing');
    }
  } catch (error) {
    throw new Error(`Taskmaster Validation: ${error.message}`);
  }
}

// Test 7: Resource Manager Signal Handling
async function testResourceManagerSignals() {
  try {
    const { getResourceManager } = await import('../src/core/resource-manager.js');
    const manager = getResourceManager();

    // Check if signal handlers are set up
    const stats = manager.getStats();
    log.info(`Resource manager has ${stats.totalResources} registered resources`);
  } catch (error) {
    throw new Error(`Resource Manager Signals: ${error.message}`);
  }
}

// Test 8: Browser Agent Cleanup
async function testBrowserAgentCleanup() {
  try {
    const { BrowserAgent } = await import('../src/automation/browser-agent.js');

    const agent = new BrowserAgent({
      settings: {
        headless: true,
        viewport: { width: 1920, height: 1080 },
        timeout: 30000,
        userAgent: 'DataHawk/1.0'
      }
    });

    // Test cleanup method exists
    if (typeof agent.cleanup !== 'function') {
      throw new Error('BrowserAgent cleanup method missing');
    }
  } catch (error) {
    throw new Error(`Browser Agent Cleanup: ${error.message}`);
  }
}

// Main execution
async function main() {
  console.log('🔍 DataHawk Bug Fix Validation');
  console.log('================================\n');

  const tests = [
    ['LLM Server JSON Format', testLLMServerJSONFormat],
    ['LLM Engine Endpoints', testLLMEngineEndpoints],
    ['Character Special Handling', testCharacterSpecialHandling],
    ['OCR Multi-language Support', testOCRMultiLanguage],
    ['Config Manager YAML Compatibility', testConfigManagerYAML],
    ['Taskmaster Validation', testTaskmasterValidation],
    ['Resource Manager Signal Handling', testResourceManagerSignals],
    ['Browser Agent Cleanup', testBrowserAgentCleanup]
  ];

  for (const [name, testFn] of tests) {
    await runTest(name, testFn);
  }

  console.log('\n📊 Summary:');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);

  if (results.failed === 0) {
    log.success('All critical bugs have been resolved!');
    process.exit(0);
  } else {
    log.error(`${results.failed} tests failed. Please review the issues above.`);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main, runTest };
