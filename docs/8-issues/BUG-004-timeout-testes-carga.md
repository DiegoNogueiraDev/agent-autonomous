# BUG-004: Timeout em Testes de Carga com Textos Extensos

## Descrição
Os testes de carga que envolvem textos longos ou processamento de múltiplas validações simultâneas estão excedendo o timeout configurado, resultando em falhas de teste. Esse problema é particularmente visível no teste "deve lidar com valores muito diferentes em tamanho" que excede o limite de 20 segundos.

## Passos para Reprodução
1. Iniciar o servidor LLM com `python3 llm-server.py`
2. Executar os testes de resiliência:
   ```bash
   npx jest --testMatch="**/tests/unit/complex-llm-test.ts" -t "resiliência"
   ```
3. Observar que o teste "deve lidar com valores muito diferentes em tamanho" falha por timeout

## Comportamento Esperado
O sistema deve processar textos grandes dentro de um tempo razoável, considerando a natureza do processamento de LLM. Para testes, os timeouts deveriam ser adequadamente configurados para cargas específicas.

## Comportamento Atual
O teste está falhando com a seguinte mensagem:
```
● LocalLLMEngine - Cenários Complexos › Testes de resiliência › deve lidar com valores muito diferentes em tamanho

    thrown: "Exceeded timeout of 20000 ms for a test.
    Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
```

A tentativa de processar o grande volume de texto excede o timeout padrão do teste.

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Python: 3.8+
- Modelo: llama3-8b-instruct.Q4_K_M.gguf

## Evidências
Logs do teste mostrando o timeout:
```
  ● LocalLLMEngine - Cenários Complexos › Testes de resiliência › deve lidar com valores muito diferentes em tamanho

    thrown: "Exceeded timeout of 20000 ms for a test.
    Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."

      175 |     }, 30000);
      176 |
    > 177 |     test('deve lidar com valores muito diferentes em tamanho', async () => {
          |         ^
      178 |       const modelExists = await llmEngine.checkModelExists();
      179 |       if (!modelExists) return;
      180 |
```

Análise de código mostra que o teste está configurado com um timeout de 20 segundos implícito, enquanto outros testes similares usam timeouts maiores:

```typescript
// O teste anterior usa timeout de 30 segundos
test('deve lidar com prompts muito grandes (próximo ao limite de contexto)', async () => {
  // ...
}, 30000);

// Este teste não tem timeout explícito, usando o padrão de 20 segundos
test('deve lidar com valores muito diferentes em tamanho', async () => {
  // ...
});
```

## Possível Solução
Existem várias abordagens para resolver este problema:

1. **Aumentar o timeout do teste específico**:
   ```typescript
   test('deve lidar com valores muito diferentes em tamanho', async () => {
     // ...
   }, 40000); // Aumentar para 40 segundos
   ```

2. **Otimizar o processamento de LLM para textos grandes**:
   ```typescript
   // No servidor LLM, implementar cache para respostas similares
   class LlamaServer:
       def __init__(self):
           self.llm = None
           self.model_loaded = False
           self.response_cache = {}  # Cache simples

       def generate(self, prompt: str, max_tokens: int = 1024, temperature: float = 0.1):
           # Verificar cache para resposta similar
           cache_key = self._get_cache_key(prompt, max_tokens, temperature)
           if cache_key in self.response_cache:
               return self.response_cache[cache_key]

           # Processamento normal...
           response = self._generate_actual_response(prompt, max_tokens, temperature)

           # Salvar no cache
           self.response_cache[cache_key] = response
           return response
   ```

3. **Implementar truncamento inteligente para textos muito grandes**:
   ```typescript
   private preprocessLargeTexts(request: ValidationDecisionRequest): ValidationDecisionRequest {
     const MAX_TEXT_LENGTH = 1000;

     if (request.csvValue && request.csvValue.length > MAX_TEXT_LENGTH) {
       // Trunca mantendo início e fim
       const truncated = request.csvValue.substring(0, MAX_TEXT_LENGTH/2) +
                         " [...] " +
                         request.csvValue.substring(request.csvValue.length - MAX_TEXT_LENGTH/2);
       return {
         ...request,
         csvValue: truncated
       };
     }

     // Similar para webValue
     return request;
   }
   ```

4. **Paralelizar o processamento para testes de carga**:
   ```typescript
   // Implementar processamento em paralelo para testes de carga
   async batchValidationDecisions(requests: ValidationDecisionRequest[]): Promise<ValidationDecisionResponse[]> {
     // Limita o número de chamadas simultâneas para evitar sobrecarga
     const batchSize = 3;
     const results: ValidationDecisionResponse[] = [];

     for (let i = 0; i < requests.length; i += batchSize) {
       const batch = requests.slice(i, i + batchSize);
       const batchResults = await Promise.all(
         batch.map(req => this.makeValidationDecision(req))
       );
       results.push(...batchResults);
     }

     return results;
   }
   ```

## Notas Adicionais
Este problema não afeta apenas os testes, mas também o desempenho do sistema em produção com dados reais. Textos grandes são comuns em diversos cenários de validação (descrições de produtos, conteúdo de artigos, etc.), e o sistema precisa lidar eficientemente com eles para ser útil em ambientes de produção.
