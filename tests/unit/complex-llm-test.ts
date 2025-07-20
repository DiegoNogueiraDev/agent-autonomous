import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { LocalLLMEngine } from '../../src/llm/local-llm-engine';
import type { LLMSettings, ValidationDecisionRequest } from '../../src/types/index';

describe('LocalLLMEngine - Cenários Complexos', () => {
  let llmEngine: LocalLLMEngine;
  let mockSettings: LLMSettings;

  beforeEach(() => {
    mockSettings = {
      modelPath: './models/llama3-8b-instruct.Q4_K_M.gguf',
      fallbackModelPath: './models/phi-3-mini-4k-instruct.Q4_K_M.gguf',
      contextSize: 8192,
      threads: 4,
      batchSize: 512,
      gpuLayers: 0,
      temperature: 0.1,
      maxTokens: 1024
    };

    llmEngine = new LocalLLMEngine({
      settings: mockSettings,
      enableFallback: true
    });
  });

  afterEach(async () => {
    // Cleanup any resources
    if (llmEngine && typeof (llmEngine as any).cleanup === 'function') {
      await (llmEngine as any).cleanup();
    }
  });

  describe('Validação com caracteres especiais', () => {
    const testeCaracteresEspeciais = [
      {
        desc: 'acentuação portuguesa',
        csvValue: 'João da Silva Açaí',
        webValue: 'João da Silva Açaí',
        expect: true
      },
      {
        desc: 'caracteres chineses',
        csvValue: '你好世界',
        webValue: '你好世界',
        expect: true
      },
      {
        desc: 'emojis',
        csvValue: 'Teste com emoji 🚀',
        webValue: 'Teste com emoji 🚀',
        expect: true
      },
      {
        desc: 'HTML entities',
        csvValue: 'João & Maria',
        webValue: 'João &amp; Maria',
        expect: true
      },
      {
        desc: 'caracteres de escape',
        csvValue: 'Linha1\\nLinha2',
        webValue: 'Linha1\nLinha2',
        expect: true
      }
    ];

    test.each(testeCaracteresEspeciais)('deve lidar com $desc', async ({ csvValue, webValue, expect: shouldMatch }) => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) {
        console.log('⚠️ Modelo não encontrado, pulando teste');
        return;
      }

      await llmEngine.initialize();

      const request: ValidationDecisionRequest = {
        csvValue,
        webValue,
        fieldType: 'string',
        fieldName: 'nome_completo'
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result.match).toBe(shouldMatch);
      if (shouldMatch) {
        expect(result.confidence).toBeGreaterThan(0.7);
      }
    }, 15000);
  });

  describe('Validação de formatos complexos', () => {
    test('deve lidar com JSON aninhado', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const complexCsvValue = '{"user":{"name":"Maria","details":{"age":30,"active":true}}}';
      const complexWebValue = '{&quot;user&quot;:{&quot;name&quot;:&quot;Maria&quot;,&quot;details&quot;:{&quot;age&quot;:30,&quot;active&quot;:true}}}';

      const request: ValidationDecisionRequest = {
        csvValue: complexCsvValue,
        webValue: complexWebValue,
        fieldType: 'json',
        fieldName: 'user_data'
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result.match).toBe(true);
    }, 15000);

    test('deve comparar endereços formatados diferentemente', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const csvValue = 'Rua das Flores, 123, Apto 45, São Paulo - SP, 01234-567';
      const webValue = 'Rua das Flores, 123\nApto 45\nSão Paulo - SP\n01234-567';

      const request: ValidationDecisionRequest = {
        csvValue,
        webValue,
        fieldType: 'address',
        fieldName: 'endereco'
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result.match).toBe(true);
    }, 15000);

    test('deve detectar anomalias em textos similares', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const csvValue = 'Produto X500 - R$ 1.299,99 - 12x sem juros';
      const webValue = 'Produto X500 - R$ 1.299,99 - 10x sem juros';

      const request: ValidationDecisionRequest = {
        csvValue,
        webValue,
        fieldType: 'product_description',
        fieldName: 'descricao'
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result.match).toBe(false);
      expect(result.reasoning).toContain('juros');
    }, 15000);
  });

  describe('Testes de resiliência', () => {
    test('deve lidar com prompts muito grandes (próximo ao limite de contexto)', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      // Gerar texto grande mas ainda dentro do limite de contexto
      const largeText = 'A'.repeat(2000);

      const request: ValidationDecisionRequest = {
        csvValue: largeText,
        webValue: largeText,
        fieldType: 'text',
        fieldName: 'conteudo'
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result).toBeDefined();
      expect(result.match).toBe(true);
    }, 30000);

    test('deve lidar com valores muito diferentes em tamanho', async () => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const csvValue = 'Resumo: Produto de alta qualidade';
      const webValue = 'Resumo: Produto de alta qualidade. ' + 'Descrição detalhada: '.repeat(50) + 'Excelente acabamento.';

      const request: ValidationDecisionRequest = {
        csvValue,
        webValue,
        fieldType: 'product_description',
        fieldName: 'descricao'
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result).toBeDefined();
      // Deveria reconhecer que o texto CSV é um subconjunto do texto Web
      expect(result.confidence).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Validação multi-idioma', () => {
    const testesMultiIdioma = [
      {
        desc: 'português',
        csvValue: 'Olá, como vai você?',
        webValue: 'Olá, como vai você?',
        language: 'pt'
      },
      {
        desc: 'inglês',
        csvValue: 'Hello, how are you?',
        webValue: 'Hello, how are you?',
        language: 'en'
      },
      {
        desc: 'espanhol',
        csvValue: '¿Hola, cómo estás?',
        webValue: '¿Hola, cómo estás?',
        language: 'es'
      },
      {
        desc: 'mistura de idiomas',
        csvValue: 'Hello mundo! Como vai you?',
        webValue: 'Hello mundo! Como vai you?',
        language: 'mixed'
      }
    ];

    test.each(testesMultiIdioma)('deve validar texto em $desc', async ({ csvValue, webValue, language }) => {
      const modelExists = await llmEngine.checkModelExists();
      if (!modelExists) return;

      await llmEngine.initialize();

      const request: ValidationDecisionRequest = {
        csvValue,
        webValue,
        fieldType: 'text',
        fieldName: 'greeting',
        context: { language }
      };

      const result = await llmEngine.makeValidationDecision(request);
      expect(result.match).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
    }, 15000);
  });
});
