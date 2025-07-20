# BUG-022: Execuções múltiplas simultâneas falham imediatamente

## Descrição
Ao executar múltiplas instâncias simultâneas do DataHawk, ambas falham imediatamente com erro de LLM server não encontrado, mesmo sem conflito de recursos aparente.

## Reprodução
1. Executar duas instâncias simultaneamente:
   ```bash
   node dist/main.js validate --input data/input/large-test.csv --config config/sample-validation.yaml --output test-stress --format json &
   node dist/main.js validate --input data/input/sample.csv --config config/sample-validation.yaml --output test-stress2 --format json &
   ```
2. Ambas falham com "LLM server not running"

## Impacto
- Alto - Sistema não suporta concorrência
- Impede uso em ambiente de produção com múltiplos workers
- Limita escalabilidade horizontal

## Análise
Possíveis causas:
1. **Porta única do LLM server**: Múltiplas instâncias competindo pela mesma porta
2. **Inicialização de recursos conflitante**: Browser agents ou outros recursos compartilhados
3. **Falta de isolamento**: Configurações ou estado compartilhado entre instâncias

## Comportamento Observado
- Ambas instâncias inicializam normalmente
- Ambas falham na etapa de inicialização do LLM engine
- Falha é imediata, não por timeout

## Comportamento Esperado
- Instâncias devem rodar independentemente
- Cada instância deve usar porta/recursos únicos
- Ou usar pool de recursos compartilhados adequadamente

## Localização
- Inicialização do LLM Engine
- Gestão de recursos compartilhados

## Prioridade
🔴 Alta - Impede escalabilidade

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:16:XX

## Tipo de Teste
- [ ] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [ ] Integração
- [x] Massivo/Stress