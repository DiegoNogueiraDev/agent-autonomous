# BUG-026: Falha de comunicação Node.js com LLM Server

## Descrição
Servidor LLM funciona corretamente quando testado diretamente via curl, mas falha consistentemente quando chamado pelo sistema Node.js, gerando erro "LLM validation request failed: fetch failed".

## Reprodução
1. Iniciar servidor LLM: `python3 llm-server.py`
2. Testar diretamente: `curl -s -X POST http://localhost:8000/validate -H "Content-Type: application/json" -d '{"csv_data": "test", "web_data": "test", "field_name": "test"}'` ✅ FUNCIONA
3. Executar validação via Node.js: `node dist/main.js validate --input data/input/sample.csv --config config/complete-validation.yaml --output test --format json` ❌ FALHA

## Evidências

### ✅ Teste Direto (Funciona)
```bash
$ curl -s -X POST http://localhost:8000/validate -H "Content-Type: application/json" -d '{"csv_data": "test", "web_data": "test", "field_name": "test"}'
{"confidence":1.0,"match":true,"processing_time":8.415136575698853,"reasoning":"Fallback string comparison","tokens":1}
```

### ❌ Via Node.js (Falha)
```
[31merror[39m: Failed to make validation decision {"error":{"error":"LLM validation request failed: fetch failed","fieldName":"email","processingTime":394},"service":"datahawk","timestamp":"2025-07-20T06:37:12.562Z"}
```

## Análise Técnica
1. **Servidor LLM**: Funcional e responde corretamente
2. **Endpoint /validate**: Responde adequadamente a requisições HTTP POST
3. **Problema de comunicação**: Node.js não consegue alcançar o servidor
4. **Possíveis causas**:
   - URL incorreta no Node.js
   - Headers HTTP incorretos
   - Timeout muito baixo
   - Problema na implementação do fetch no Node.js
   - Concurrent requests causando travamento do servidor

## Impacto
🔴 **Crítico** - Funcionalidade principal de validação LLM não funciona
- Taxa de sucesso reportada incorretamente (100% quando deveria ser 0%)
- Sistema é inútil para validação inteligente
- Todos os testes mostram confidence 0%

## Observações
- Servidor LLM iniciado e funcionando
- Health check passa: "LLM server found and ready"
- Extração de dados funciona: "successfulExtractions":4
- Falha apenas na validação LLM

## Investigação Necessária
1. Verificar URL utilizada pelo Node.js para chamar o LLM
2. Verificar formato da requisição enviada pelo Node.js
3. Verificar logs do servidor Python durante chamadas do Node.js
4. Verificar se há problema de concurrent requests
5. Verificar timeouts de network no Node.js

## Localização
- Comunicação entre `local-llm-engine.ts` e `llm-server.py`
- Implementação do fetch no Node.js
- Configuração de endpoints

## Prioridade
🔴 Crítica - Sistema principal não funciona

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:37:XX

## Tipo de Teste
- [x] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [x] Integração
- [ ] Massivo/Stress