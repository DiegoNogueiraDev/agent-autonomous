#!/usr/bin/env node

/**
 * Teste rápido para verificar comunicação com LLM Server
 */

import { LocalLLMEngine } from './dist/llm/local-llm-engine.js';

async function testLLMCommunication() {
  console.log('🧪 Testando comunicação com LLM Server...');

  const llmEngine = new LocalLLMEngine({
    settings: {
      modelPath: './models/llama-2-7b-chat.gguf',
      contextSize: 2048,
      threads: 4,
      temperature: 0.7,
      maxTokens: 100
    }
  });

  try {
    console.log('Inicializando LLM Engine...');
    await llmEngine.initialize();

    console.log('✅ LLM Engine inicializado com sucesso');

    // Teste de validação
    const testRequest = {
      csvValue: 'test@example.com',
      webValue: 'test@example.com',
      fieldType: 'email',
      fieldName: 'email'
    };

    console.log('Enviando requisição de validação...');
    const result = await llmEngine.makeValidationDecision(testRequest);

    console.log('\nResultado da validação:');
    console.log(`Match: ${result.match}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Reasoning: ${result.reasoning}`);
    console.log(`✅ Comunicação com LLM Server funcionando!`);

  } catch (error) {
    console.error('❌ Erro na comunicação com LLM Server:', error.message);
  } finally {
    await llmEngine.cleanup();
  }
}

testLLMCommunication().catch(console.error);
