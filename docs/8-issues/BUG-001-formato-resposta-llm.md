# BUG-001: Falha no Formato de Resposta do Servidor LLM

## Descrição
O servidor LLM não está retornando respostas no formato JSON esperado pelo engine de validação. Os logs mostram várias mensagens de erro como: "All JSON parsing methods failed, falling back to text parsing" e "llama.cpp format failed, trying alternative format". O servidor está retornando textos como "# Example response\n```" em vez do formato JSON estruturado necessário para validação.

## Passos para Reprodução
1. Iniciar o servidor LLM com `python3 llm-server.py`
2. Executar testes unitários com `npx jest --testMatch="**/tests/unit/complex-llm-test.ts"`
3. Observar os logs de erro e falha nos testes

## Comportamento Esperado
O servidor LLM deve retornar respostas JSON estruturadas no formato:
```json
{
  "match": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explicação breve"
}
```

## Comportamento Atual
O servidor LLM está retornando respostas em texto livre ou Markdown que não podem ser corretamente interpretadas como JSON. Logs mostram:
```
warn: llama.cpp format failed, trying alternative format {"error":{},"service":"datahawk","timestamp":"2025-07-20T04:57:03.633Z"}
warn: All JSON parsing methods failed, falling back to text parsing {"error":{},"originalText":"# Example response\n```","service":"datahawk","timestamp":"2025-07-20T04:57:12.686Z"}
```

Além disso, alguns endpoints estão retornando código de status 404:
```
error: Failed to make validation decision {"error":{"error":"LLM server request failed: Server responded with 404: NOT FOUND","fieldName":"greeting","processingTime":261},"service":"datahawk","timestamp":"2025-07-20T04:58:41.684Z"}
```

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Python: 3.8+
- Modelo: llama3-8b-instruct.Q4_K_M.gguf

## Evidências
Logs do teste:
```
warn: llama.cpp format failed, trying alternative format {"error":{},"service":"datahawk","timestamp":"2025-07-20T04:57:03.633Z"}
warn: All JSON parsing methods failed, falling back to text parsing {"error":{},"originalText":"# Example response\n```","service":"datahawk","timestamp":"2025-07-20T04:57:12.686Z"}
```

Falhas de teste:
```
  ● LocalLLMEngine - Cenários Complexos › Validação com caracteres especiais › deve lidar com acentuação portuguesa
    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
```

## Possível Solução
1. Modificar o prompt no servidor LLM para forçar resposta em formato JSON válido:
```python
prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>
Você é um especialista em validação de dados. Compare dois valores e determine se representam a mesma informação.

Responda APENAS com JSON válido no formato exato:
{{"match": true/false, "confidence": 0.0-1.0, "reasoning": "explicação breve"}}

<|eot_id|><|start_header_id|>user<|end_header_id|>
Campo: {field_name} (tipo: {field_type})
CSV Value: "{csv_value}"
Web Value: "{web_value}"

Compare estes valores:<|eot_id|><|start_header_id|>assistant<|end_header_id|>"""
```

2. Implementar um endpoint `/validate` no servidor que retorne o formato JSON esperado
3. Melhorar a manipulação de erros no LLMEngine para lidar com diferentes formatos de resposta

## Notas Adicionais
Este problema afeta todos os testes relacionados à validação de dados com caracteres especiais, formatos complexos e idiomas diferentes. Até que seja corrigido, a funcionalidade de validação baseada em LLM estará comprometida.
