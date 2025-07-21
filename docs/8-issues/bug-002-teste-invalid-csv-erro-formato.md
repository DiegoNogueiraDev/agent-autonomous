# Bug #002: Formato inválido no arquivo test-invalid.csv

## Descrição
O arquivo `test-invalid.csv` possui um formato inconsistente que causa falha na validação. O sistema identifica corretamente o problema mas interrompe o processamento.

## Erro
```
Failed to load CSV file: CSV validation failed: File appears to have only one column - invalid CSV structure, Inconsistent number of columns detected: 1, 1, 2
```

## Passos para reprodução
1. Execute o comando de validação usando o arquivo de dados `test-invalid.csv`:
```bash
node dist/main.js validate --input data/test-invalid.csv --config config/complete-validation.yaml --output data/qa-results/test-invalid --format json,html
```

## Análise
Ao analisar o conteúdo do arquivo `test-invalid.csv`, é possível verificar que ele possui:
- A primeira linha tem apenas uma coluna: `header1`
- A segunda linha tem apenas uma coluna: `value1`
- A terceira linha tem duas colunas: `value2,extra_column`

Este formato inconsistente viola as regras de validação do sistema, que espera que todas as linhas tenham o mesmo número de colunas.

## Impacto
- O processo de validação é completamente interrompido
- Não é gerado nenhum relatório parcial
- O usuário não recebe feedback específico sobre quais linhas têm problemas

## Gravidade
Média - Impede a validação com este arquivo, mas o comportamento é esperado para um arquivo malformado

## Solução sugerida
1. Implementar um modo de validação tolerante a falhas que processe as linhas válidas e ignore as inválidas
2. Melhorar a mensagem de erro para indicar exatamente quais linhas estão inconsistentes
3. Considerar gerar um relatório parcial mesmo com falhas no formato do CSV

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
