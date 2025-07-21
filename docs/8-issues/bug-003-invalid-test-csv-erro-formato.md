# Bug #003: Formato inválido no arquivo invalid_test.csv

## Descrição
O arquivo `invalid_test.csv` possui um número inconsistente de colunas entre as linhas, o que causa falha na validação. O sistema detecta o problema mas interrompe todo o processamento.

## Erro
```
Failed to load CSV file: CSV validation failed: Inconsistent number of columns detected: 4, 4, 3, 4, 4
```

## Passos para reprodução
1. Execute o comando de validação usando o arquivo de dados `invalid_test.csv`:
```bash
node dist/main.js validate --input data/invalid_test.csv --config config/complete-validation.yaml --output data/qa-results/invalid_test --format json,html
```

## Análise
Ao analisar o conteúdo do arquivo `invalid_test.csv`, é possível verificar que ele possui inconsistências:
- A maioria das linhas tem 4 colunas
- A terceira linha tem apenas 3 colunas (faltando um campo)
- A última linha está incompleta (tem menos colunas)

A inconsistência na terceira linha é detectada pelo validador, que interrompe completamente o processamento.

## Impacto
- O processo de validação é completamente interrompido
- Não é gerado nenhum relatório parcial ou listagem de quais linhas estão incorretas
- O usuário não pode validar o restante do arquivo que poderia estar correto

## Gravidade
Média - Impede a validação com este arquivo, mas o comportamento é esperado para um arquivo com formato inconsistente

## Solução sugerida
1. Implementar um modo de validação tolerante que possa:
   - Ignorar linhas com formato inconsistente e continuar o processamento
   - Incluir um relatório de quais linhas foram ignoradas e por qual motivo
   - Permitir configurar um percentual aceitável de linhas com erro (threshold)

2. Adicionar uma opção de linha de comando para forçar o processamento mesmo com inconsistências:
```bash
node dist/main.js validate --input data/invalid_test.csv --force-process --config config/complete-validation.yaml
```

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
