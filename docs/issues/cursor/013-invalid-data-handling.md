# Problema #013: Tratamento Inadequado de Dados Inválidos no CSV

## Descrição
O sistema não lida adequadamente com dados inválidos ou incompletos no arquivo CSV de entrada, o que pode resultar em falhas de validação ou comportamento inesperado.

## Reprodução
1. Criar um arquivo CSV com dados inválidos ou incompletos: `data/invalid_test.csv`
2. Executar o comando de validação: `npm start -- validate --input=data/invalid_test.csv --config=config/wikipedia-validation.yaml --output=test-invalid`

## Comportamento Esperado
O sistema deveria:
1. Detectar e relatar linhas com dados inválidos ou incompletos no CSV
2. Continuar processando linhas válidas mesmo quando algumas linhas têm problemas
3. Incluir informações detalhadas sobre os problemas encontrados nos relatórios
4. Oferecer opções para validação parcial (ignorar campos ausentes) ou estrita

## Comportamento Atual
O sistema falha ao lidar com dados inválidos ou incompletos no CSV de entrada, resultando em:
1. Erros não tratados durante o processamento
2. Falha completa do processo de validação em vez de validação parcial
3. Mensagens de erro genéricas que não ajudam a identificar o problema específico
4. Falta de relatórios de validação para linhas com problemas

## Impacto
Alto - Em cenários reais de uso, é comum que os arquivos CSV contenham dados imperfeitos. A incapacidade de lidar adequadamente com esses casos limita significativamente a usabilidade da ferramenta em ambientes de produção.

## Solução Proposta
1. Implementar validação prévia do CSV para identificar problemas antes da validação
2. Adicionar um modo de tolerância a falhas que permita pular linhas problemáticas
3. Melhorar as mensagens de erro para identificar exatamente qual linha e campo estão causando problemas
4. Implementar um sistema de validação em duas fases: primeiro validar a estrutura do CSV, depois validar o conteúdo
5. Adicionar uma flag de linha de comando `--strict` para determinar se o processo deve falhar com dados inválidos ou tentar recuperar-se

## Evidência
Ao tentar processar um arquivo CSV com linhas incompletas (`data/invalid_test.csv`), o sistema apresentou erros nos logs:

```
{"error":"Navigator agent or browser not available","level":"error","message":"Multi-agent validation failed","service":"datahawk","stack":"Error: Navigator agent or browser not available\n
   at CrewOrchestrator.executeNavigationPhase (/home/diego/Projetos/agent-autonomous/src/agents
/crew-orchestrator.ts:427:13)\n    at CrewOrchestrator.executeRowValidation (/home/diego/Projet
os/agent-autonomous/src/agents/crew-orchestrator.ts:376:43)\n    at TaskmasterController.valida
teData (/home/diego/Projetos/agent-autonomous/src/core/taskmaster.ts:163:58)\n    at processTic
ksAndRejections (node:internal/process/task_queues:105:5)","timestamp":"2025-07-20T03:18:07.700Z"}
```

Estes erros indicam que o sistema não está preparado para lidar com dados incompletos ou inválidos, falhando no processo de navegação quando deveria detectar e relatar o problema de forma mais robusta. 