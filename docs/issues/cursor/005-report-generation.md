# Problema #005: Falha na Geração de Relatórios

## Descrição
O sistema cria a estrutura de diretórios e evidências durante a validação, mas falha em gerar os arquivos de relatório nos formatos especificados (JSON e HTML por padrão).

## Reprodução
1. Executar o comando de validação: `npm start -- validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia`
2. Verificar o diretório de saída: `ls -la test-wikipedia/`
3. Não há arquivos de relatório gerados (JSON ou HTML)

## Comportamento Esperado
O sistema deveria gerar relatórios nos formatos especificados (JSON e HTML por padrão) após concluir a validação, como mencionado na documentação:
```
Arquivos gerados:
├── meu-teste/datahawk-report-*.html    # Dashboard visual
├── meu-teste/datahawk-report-*.json    # Dados estruturados
```

## Comportamento Atual
O sistema cria apenas a estrutura de diretórios para evidências, mas não gera os arquivos de relatório final. Isso pode ser devido a:
1. O processo de validação falha antes de completar
2. Há um erro no módulo de geração de relatórios
3. O processo fica travado em algum ponto da execução

## Impacto
Alto - A falha na geração de relatórios impede que o usuário tenha acesso aos resultados da validação, que é o objetivo principal da ferramenta.

## Solução Proposta
1. Implementar mecanismos de timeout e recuperação de erros no processo de validação
2. Adicionar logs mais detalhados para identificar em qual etapa o processo falha
3. Garantir que, mesmo em caso de erro durante a validação, relatórios parciais sejam gerados
4. Adicionar uma flag `--force-report` para gerar relatórios mesmo em caso de erros

## Evidência
Após executar o comando de validação e verificar o diretório de saída:
```
$ ls -la test-wikipedia/
total 12
drwxr-xr-x  3 diego diego 4096 jul 19 23:56 .
drwxr-xr-x 21 diego diego 4096 jul 19 23:56 ..
drwxr-xr-x  6 diego diego 4096 jul 19 23:56 evidence
```

Não há arquivos de relatório (JSON ou HTML) gerados como esperado, apenas o diretório de evidências. 