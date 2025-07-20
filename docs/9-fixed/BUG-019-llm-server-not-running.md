# BUG-019: LLM Server não está rodando após validação

## Descrição
Após o processo de validação, o LLM server não está mais rodando em localhost:8000. Durante a validação, o log mostrava que o servidor estava healthy, mas agora não responde.

## Reprodução
1. Executar validação que usa LLM
2. Após validação, tentar acessar `http://localhost:8000/health`
3. Servidor não responde

## Impacto
- Alto - LLM server se desconecta após uso
- Impede validações subsequentes
- Força restart manual do servidor

## Análise
Possível problema de limpeza de recursos onde o servidor LLM é fechado incorretamente ou o processo não persiste após uso.

## Investigação
O log mostra: `LLM Engine cleaned up` - pode estar fechando o servidor quando deveria apenas limpar a instância do cliente.

## Localização
Sistema de limpeza de recursos do LLM Engine

## Prioridade
🔴 Alta - Impede uso contínuo

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:14:XX

## Tipo de Teste
- [x] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [ ] Integração
- [ ] Massivo/Stress