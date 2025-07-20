# Problema #004: Estrutura de Evidências sem Índice

## Descrição
O sistema cria uma estrutura de diretórios para armazenar evidências, mas não gera um arquivo de índice ou manifesto para facilitar a navegação e compreensão dessas evidências.

## Reprodução
1. Executar o comando de validação: `npm start -- validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia`
2. Verificar o diretório de saída: `ls -la test-wikipedia/evidence/`

## Comportamento Esperado
O sistema deveria gerar um arquivo de índice (como `evidence_index.json` ou `evidence_manifest.json`) contendo metadados sobre cada evidência coletada, incluindo:
- Tipo de evidência (screenshot, dom-snapshot, etc.)
- Relação com os dados de entrada (linha do CSV, campo, etc.)
- Timestamp da coleta
- Resultado da validação associado
- Qualquer informação contextual relevante

## Comportamento Atual
O sistema cria diretórios para os diferentes tipos de evidências (`data`, `dom-snapshots`, `logs`, `screenshots`), mas não gera um arquivo central de índice para permitir a correlação entre as evidências e os resultados da validação.

## Impacto
Médio - A falta de um índice dificulta a análise e interpretação das evidências coletadas, especialmente em conjuntos de dados maiores, onde pode ser difícil correlacionar uma evidência específica com o registro correspondente no CSV de entrada.

## Solução Proposta
1. Implementar a geração de um arquivo `evidence_index.json` no diretório raiz de evidências
2. Este arquivo deve conter metadados para cada evidência, incluindo referências cruzadas para o registro CSV correspondente
3. Considerar adicionar uma interface web simples para navegar pelas evidências usando este índice

## Evidência
```
$ ls -la test-wikipedia/evidence/
total 24
drwxr-xr-x 6 diego diego 4096 jul 19 23:56 .
drwxr-xr-x 3 diego diego 4096 jul 19 23:56 ..
drwxr-xr-x 2 diego diego 4096 jul 19 23:56 data
drwxr-xr-x 2 diego diego 4096 jul 19 23:56 dom-snapshots
drwxr-xr-x 2 diego diego 4096 jul 19 23:56 logs
drwxr-xr-x 2 diego diego 4096 jul 19 23:56 screenshots
```

Verifica-se que existe uma estrutura organizada para armazenar evidências por tipo, porém não há um arquivo de índice para correlacionar estas evidências com os registros validados. 