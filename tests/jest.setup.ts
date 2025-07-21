/**
 * Configuração para Jest
 * Este arquivo é executado antes de cada arquivo de teste
 */

// Aumentar timeout global para testes
jest.setTimeout(30000);

// Mock para serviços externos quando necessário
const originalFetch = global.fetch;

// Função para mock condicional do fetch
const mockFetchConditionally = (url: string, options: RequestInit) => {
  // Se for uma chamada para o servidor LLM e ele não estiver disponível, usar mock
  if (url.includes('localhost:8000') && process.env.MOCK_LLM === 'true') {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        match: Math.random() > 0.5,
        confidence: Math.random(),
        reasoning: 'Mock LLM: ' + (Math.random() > 0.5 ? 'MATCH' : 'NO MATCH') + ' (confidence: ' + Math.random().toFixed(1) + ')'
      })
    } as Response);
  }

  // Se for uma chamada para o servidor OCR e ele não estiver disponível, usar mock
  if (url.includes('localhost:5000') && process.env.MOCK_OCR === 'true') {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        text: 'Mock OCR text',
        confidence: Math.random()
      })
    } as Response);
  }

  // Caso contrário, usar fetch real
  return originalFetch(url, options);
};

// Aplicar mock condicional
global.fetch = mockFetchConditionally as typeof fetch;

// Limpar mocks após os testes
afterAll(() => {
  global.fetch = originalFetch;
});
