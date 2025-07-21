# Bug #004: Formato inconsistente no arquivo wikipedia-test.csv

## Descrição
O arquivo `wikipedia-test.csv` possui um número inconsistente de colunas entre as linhas, causando falha na validação. O sistema detecta as inconsistências mas interrompe todo o processamento em vez de continuar com as linhas válidas.

## Erro
```
Failed to load CSV file: CSV validation failed: Inconsistent number of columns detected: 6, 8, 8, 8, 6
```

## Passos para reprodução
1. Execute o comando de validação usando o arquivo de dados `wikipedia-test.csv`:
```bash
node dist/main.js validate --input data/wikipedia-test.csv --config config/wikipedia-validation.yaml --output data/qa-results/wikipedia-test --format json,html
```

## Análise
Ao analisar o conteúdo do arquivo `wikipedia-test.csv`, é possível verificar que:
- A primeira linha (cabeçalho) tem 6 colunas
- Algumas linhas têm 8 colunas - possivelmente devido a campos que contêm vírgulas sem estarem devidamente escapados com aspas

Isso indica que podem haver problemas na formatação dos campos que contêm texto longo com vírgulas não escapadas. O sistema de validação CSV identifica essa inconsistência e interrompe o processamento.

## Impacto
- O processo de validação é completamente interrompido
- Não é possível validar nenhum dado mesmo que parte do arquivo esteja correta
- O usuário não recebe informação detalhada sobre quais campos específicos estão causando o problema

## Gravidade
Alta - Impede a validação de dados importantes para testes do Wikipedia

## Solução sugerida
1. Corrigir o arquivo `wikipedia-test.csv` garantindo que todos os campos que contêm vírgulas estejam adequadamente entre aspas duplas.
2. Exemplo de correção:
```csv
articleName,title,introduction,infoboxTitle,lastModified,imageCaption
Brasil,"Brasil","O Brasil (escrita antiga: Brasil), oficialmente República Federativa do Brasil, é o maior país da América do Sul e da América Latina","Brasil","Esta página foi editada pela última vez","Bandeira do Brasil"
```

3. Implementar um modo de tolerância a erros que permita:
   - Identificar e relatar problemas de formato sem interromper o processamento
   - Tentar corrigir automaticamente problemas comuns de formatação CSV
   - Fornecer um relatório detalhado dos problemas encontrados

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
