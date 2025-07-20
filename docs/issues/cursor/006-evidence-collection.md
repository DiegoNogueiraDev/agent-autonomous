# Problema #006: Falha na Coleta de Evidências

## Descrição
O sistema cria a estrutura de diretórios para evidências, mas não armazena nenhum arquivo dentro desses diretórios. Os diretórios para screenshots, dom-snapshots, logs e dados estão vazios.

## Reprodução
1. Executar o comando de validação: `npm start -- validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia`
2. Verificar os diretórios de evidências: 
   - `ls -la test-wikipedia/evidence/screenshots/`
   - `ls -la test-wikipedia/evidence/dom-snapshots/`

## Comportamento Esperado
O sistema deveria capturar e armazenar evidências durante a validação:
- Screenshots das páginas visitadas
- Snapshots do DOM das páginas
- Logs detalhados do processo
- Dados extraídos durante a validação

## Comportamento Atual
O sistema cria os diretórios para as evidências, mas não armazena nenhum arquivo dentro deles. Isso indica que:
1. O processo de validação falha antes de capturar as evidências
2. Há um erro no módulo de coleta de evidências
3. A navegação nas páginas não está funcionando corretamente

## Impacto
Alto - A falta de evidências impossibilita a análise e verificação dos resultados da validação, o que é uma funcionalidade essencial para uma ferramenta de QA autônoma.

## Solução Proposta
1. Adicionar logging detalhado no módulo de coleta de evidências (`src/evidence/evidence-collector.ts`)
2. Implementar verificações para garantir que a navegação no browser ocorreu com sucesso
3. Adicionar fallbacks para capturar pelo menos alguns tipos de evidências, mesmo em caso de falha parcial
4. Permitir a execução da coleta de evidências de forma independente para debug: `npm start -- evidence --input=data/wikipedia_test.csv --url=https://pt.wikipedia.org/wiki/Albert_Einstein`

## Evidência
Verificação dos diretórios de evidências após a execução do comando de validação:

```
$ ls -la test-wikipedia/evidence/screenshots/
total 8
drwxr-xr-x 2 diego diego 4096 jul 19 23:56 .
drwxr-xr-x 6 diego diego 4096 jul 19 23:56 ..

$ ls -la test-wikipedia/evidence/dom-snapshots/
total 8
drwxr-xr-x 2 diego diego 4096 jul 19 23:56 .
drwxr-xr-x 6 diego diego 4096 jul 19 23:56 ..
```

Todos os diretórios de evidências estão vazios, o que indica falha no processo de coleta de evidências. 