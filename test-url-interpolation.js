#!/usr/bin/env node

/**
 * Teste rápido para verificar interpolação de URL
 */

import { BrowserAgent } from './dist/automation/browser-agent.js';

async function testUrlInterpolation() {
  console.log('🧪 Testando interpolação de URL...');

  const browserAgent = new BrowserAgent({
    settings: {
      headless: true,
      timeout: 30000,
      viewport: { width: 1280, height: 720 },
      userAgent: 'DataHawk/1.0',
      slowMo: 0
    }
  });

  try {
    await browserAgent.initialize();

    // Teste de interpolação
    const testCases = [
      {
        url: 'https://pt.wikipedia.org/wiki/{titulo}',
        data: { titulo: 'Brasil' },
        expected: 'https://pt.wikipedia.org/wiki/Brasil'
      },
      {
        url: 'https://www.gov.br/pt-br/servicos/{serviceCode}',
        data: { serviceCode: 'obter-passaporte' },
        expected: 'https://www.gov.br/pt-br/servicos/obter-passaporte'
      },
      {
        url: 'https://example.com/search?q={query}',
        data: { query: 'teste de busca' },
        expected: 'https://example.com/search?q=teste%20de%20busca'
      }
    ];

    for (const testCase of testCases) {
      const result = browserAgent['interpolateUrl'](testCase.url, testCase.data);
      console.log(`\nURL: ${testCase.url}`);
      console.log(`Dados: ${JSON.stringify(testCase.data)}`);
      console.log(`Resultado: ${result}`);
      console.log(`Esperado: ${testCase.expected}`);
      console.log(`✅ ${result === testCase.expected ? 'CORRETO' : 'INCORRETO'}`);
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await browserAgent.cleanup();
  }
}

testUrlInterpolation().catch(console.error);
