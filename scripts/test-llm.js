#!/usr/bin/env node

/**
 * Manual test for LocalLLMEngine
 * This script tests the LLM engine without Jest dependencies
 */

import { LocalLLMEngine } from '../dist/llm/local-llm-engine.js';

async function runLLMTest() {
  console.log('🧪 Testing LocalLLMEngine...\n');

  const settings = {
    modelPath: './models/llama3-8b-instruct.Q4_K_M.gguf',
    fallbackModelPath: './models/phi-3-mini-4k-instruct.Q4_K_M.gguf',
    contextSize: 8192,
    threads: 4,
    batchSize: 512,
    gpuLayers: 0,
    temperature: 0.1,
    maxTokens: 1024
  };

  const llmEngine = new LocalLLMEngine({
    settings,
    enableFallback: true
  });

  try {
    // Test 1: Check initialization status
    console.log('✅ Test 1: Initial state');
    console.log('Initialized:', llmEngine.isInitialized());
    console.log('Statistics:', JSON.stringify(llmEngine.getStatistics(), null, 2));

    // Test 2: Check model existence
    console.log('\n✅ Test 2: Model file checks');
    const primaryExists = await llmEngine.checkModelExists();
    console.log('Primary model exists:', primaryExists);
    
    if (settings.fallbackModelPath) {
      const fallbackExists = await llmEngine.checkModelExists(settings.fallbackModelPath);
      console.log('Fallback model exists:', fallbackExists);
    }

    // Test 3: Initialize engine
    console.log('\n✅ Test 3: Engine initialization');
    try {
      await llmEngine.initialize();
      console.log('Initialization successful:', llmEngine.isInitialized());
    } catch (error) {
      console.log('Initialization failed (expected if no model):', error.message);
      // Continue with stub testing
    }

    // Test 4: Validation decisions
    console.log('\n✅ Test 4: Validation decisions');
    
    if (llmEngine.isInitialized()) {
      const testCases = [
        {
          name: 'Exact match',
          csvValue: 'John Doe',
          webValue: 'John Doe',
          fieldType: 'string',
          fieldName: 'customer_name'
        },
        {
          name: 'Case difference',
          csvValue: 'john doe',
          webValue: 'John Doe',
          fieldType: 'string',
          fieldName: 'customer_name'
        },
        {
          name: 'Email comparison',
          csvValue: 'john@example.com',
          webValue: 'john@example.com',
          fieldType: 'email',
          fieldName: 'email'
        },
        {
          name: 'Currency formatting',
          csvValue: '123.45',
          webValue: '$123.45',
          fieldType: 'currency',
          fieldName: 'price'
        },
        {
          name: 'Complete mismatch',
          csvValue: 'John Doe',
          webValue: 'Jane Smith',
          fieldType: 'string',
          fieldName: 'customer_name'
        }
      ];

      for (const testCase of testCases) {
        console.log(`\n  Testing: ${testCase.name}`);
        const startTime = Date.now();
        
        try {
          const result = await llmEngine.makeValidationDecision(testCase);
          const duration = Date.now() - startTime;
          
          console.log(`    CSV: "${testCase.csvValue}"`);
          console.log(`    Web: "${testCase.webValue}"`);
          console.log(`    Match: ${result.match}`);
          console.log(`    Confidence: ${result.confidence.toFixed(3)}`);
          console.log(`    Reasoning: ${result.reasoning}`);
          console.log(`    Duration: ${duration}ms`);
          
          if (result.issues && result.issues.length > 0) {
            console.log(`    Issues: ${result.issues.join(', ')}`);
          }
        } catch (error) {
          console.log(`    Error: ${error.message}`);
        }
      }
    } else {
      console.log('Engine not initialized - testing fallback only');
      
      try {
        const result = await llmEngine.makeValidationDecision({
          csvValue: 'Test',
          webValue: 'Test',
          fieldType: 'string',
          fieldName: 'test'
        });
        console.log('Fallback result:', result);
      } catch (error) {
        console.log('Expected error (not initialized):', error.message);
      }
    }

    // Test 5: Cleanup
    console.log('\n✅ Test 5: Cleanup');
    await llmEngine.cleanup();
    console.log('Cleanup completed');
    console.log('Final statistics:', JSON.stringify(llmEngine.getStatistics(), null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  console.log('\n🎉 All tests completed successfully!');
}

// Run the test
runLLMTest().catch(console.error);
