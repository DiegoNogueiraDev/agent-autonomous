# BUG-020: Formato de saída inválido aceito pelo sistema

## Descrição
O sistema aceita formatos de saída inválidos (como "invalid") sem validar se são suportados. O processo continua normalmente até falhar por outros motivos (LLM server).

## Reprodução
1. Executar `node dist/main.js validate --input data/input/sample.csv --config config/sample-validation.yaml --output test-behavior --format invalid,json`
2. Sistema aceita "invalid" como formato válido
3. Log mostra: `"formats":["invalid","json"]`
4. Processo continua até falhar por outro motivo

## Impacto
- Médio - Validação de entrada inadequada
- Pode causar confusão no usuário
- Falha tardia ao invés de falha rápida
- Desperdício de recursos processando até falhar

## Comportamento Esperado
Sistema deveria rejeitar formatos inválidos imediatamente com erro claro como:
```
Error: Invalid output format 'invalid'. Supported formats: json, html, markdown, csv
```

## Análise
Falta validação dos formatos de saída aceitos antes de iniciar o processamento.

## Localização
Validação de parâmetros da CLI

## Prioridade
🟡 Média - UX e validação de entrada

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:15:XX

## Tipo de Teste
- [ ] Funcionalidade Básica
- [x] Comportamento do Usuário  
- [ ] Integração
- [ ] Massivo/Stress