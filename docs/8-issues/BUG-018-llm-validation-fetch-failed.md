# BUG-018: Falha na validação LLM - fetch failed

## Descrição
Durante o processo de validação, todas as requisições LLM falham com erro "LLM validation request failed: fetch failed". Apesar dos erros, o sistema reporta taxa de sucesso de 100%.

## Reprodução
1. Executar `node dist/main.js validate --input data/input/sample.csv --config config/sample-validation.yaml --output test-basic --format json,html`
2. Sistema navega corretamente e extrai dados
3. Todas as decisões de validação LLM falham
4. Relatório final incorretamente mostra sucesso de 100%

## Logs de Erro
```
[31merror[39m: Failed to make validation decision {"error":{"error":"LLM validation request failed: fetch failed","fieldName":"email","processingTime":424},"service":"datahawk","timestamp":"2025-07-20T06:12:04.756Z"}
[31merror[39m: Failed to make validation decision {"error":{"error":"LLM validation request failed: fetch failed","fieldName":"name","processingTime":426},"service":"datahawk","timestamp":"2025-07-20T06:12:04.757Z"}
```

## Impacto
- 🔴 Crítico - Validação LLM não funciona
- Taxa de sucesso incorreta (100% quando deveria falhar)
- Relatórios gerados não refletem a realidade
- Confiança média de 0% indica problema na validação

## Análise
1. LLM server está rodando (status healthy)
2. Navegação e extração funcionam
3. Problema específico na comunicação com LLM para validação
4. Possível problema na URL ou formato de requisição fetch

## Investigação Necessária
- Verificar endpoint LLM correto
- Verificar formato das requisições
- Verificar se servidor LLM aceita requisições de validação

## Localização
Sistema de validação LLM

## Prioridade
🔴 Crítica - Funcionalidade principal falha

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:12:XX

## Tipo de Teste
- [x] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [ ] Integração
- [ ] Massivo/Stress