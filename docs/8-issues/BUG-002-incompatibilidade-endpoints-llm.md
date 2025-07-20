# BUG-002: Incompatibilidade entre Endpoints do Servidor LLM e Cliente

## Descrição
O cliente TypeScript (LocalLLMEngine) está tentando acessar um endpoint `/completion` que não existe no servidor LLM Python. Os logs mostram tentativas de conexão a este endpoint que retornam código 404. A implementação atual tenta fazer fallback para `/generate` mas ainda não consegue processar corretamente as respostas.

## Passos para Reprodução
1. Iniciar o servidor LLM com `python3 llm-server.py`
2. Executar testes que utilizam o LLMEngine
3. Observar os logs que mostram erro 404 e fallback entre endpoints

## Comportamento Esperado
O cliente LocalLLMEngine deve se comunicar corretamente com o servidor LLM através de endpoints compatíveis e processar adequadamente as respostas.

## Comportamento Atual
O código mostra que o cliente tenta usar um endpoint `/completion` que não está implementado no servidor:

```typescript
// No arquivo local-llm-engine.ts
const response = await fetch(`${baseUrl}/completion`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt,
    n_predict: options.max_tokens || this.settings.maxTokens,
    temperature: options.temperature || this.settings.temperature,
    stop: options.stop || ['\n'],
    stream: false
  })
});
```

Mas o servidor Python só implementa os endpoints:
- `/health`
- `/load`
- `/generate`
- `/validate`

Isso causa um erro 404 que é detectado nos logs:

```
error: Failed to make validation decision {"error":{"error":"LLM server request failed: Server responded with 404: NOT FOUND","fieldName":"greeting","processingTime":261},"service":"datahawk","timestamp":"2025-07-20T04:58:41.684Z"}
```

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Python: 3.8+
- Modelo: llama3-8b-instruct.Q4_K_M.gguf

## Evidências
Logs que mostram o erro 404:

```
warn: llama.cpp format failed, trying alternative format {"error":{},"service":"datahawk","timestamp":"2025-07-20T04:57:03.633Z"}
error: Failed to make validation decision {"error":{"error":"LLM server request failed: Server responded with 404: NOT FOUND","fieldName":"greeting","processingTime":261},"service":"datahawk","timestamp":"2025-07-20T04:58:41.684Z"}
```

Código do servidor LLM Python que não possui o endpoint `/completion`:

```python
@app.route('/health', methods=['GET'])
@app.route('/load', methods=['POST'])
@app.route('/generate', methods=['POST'])
@app.route('/validate', methods=['POST'])
```

## Possível Solução
Existem duas opções para resolver este problema:

1. **Opção 1**: Atualizar o servidor LLM para incluir o endpoint `/completion`:
   ```python
   @app.route('/completion', methods=['POST'])
   def completion():
       """Llama.cpp compatible completion endpoint"""
       try:
           data = request.get_json()
           prompt = data.get('prompt', '')
           n_predict = data.get('n_predict', 1024)
           temperature = data.get('temperature', 0.1)
           stop = data.get('stop', [])

           if not prompt:
               return jsonify({"error": "Prompt required"}), 400

           result = server.generate(prompt, n_predict, temperature)
           return jsonify({
               "content": result["text"],
               "tokens_predicted": result["tokens"],
               "timings": {
                   "predicted_ms": result["processing_time"] * 1000
               }
           })
       except Exception as e:
           return jsonify({"error": str(e)}), 500
   ```

2. **Opção 2**: Atualizar o cliente TypeScript para usar apenas o endpoint `/generate`:
   ```typescript
   // No arquivo local-llm-engine.ts
   // Remover a tentativa de usar o endpoint /completion e usar diretamente /generate
   const response = await fetch(`${baseUrl}/generate`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       prompt,
       max_tokens: options.max_tokens || this.settings.maxTokens,
       temperature: options.temperature || this.settings.temperature
     })
   });
   ```

## Notas Adicionais
Este problema afeta todas as comunicações entre o cliente TypeScript e o servidor LLM Python, resultando em falhas nos testes e validações. A segunda opção (modificar o cliente) é provavelmente mais simples e menos propensa a erros.
