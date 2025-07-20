# Problema #011: Tratamento Inadequado de Caracteres Especiais em URLs

## Descrição
O sistema apresenta problemas ao lidar com URLs contendo caracteres especiais (acentos, cedilhas, etc.), o que pode causar falhas de navegação ou extração de dados.

## Reprodução
1. Criar um arquivo CSV com entradas contendo caracteres especiais: `data/special_chars_test.csv`
2. Executar o comando de validação: `npm start -- validate --input=data/special_chars_test.csv --config=config/wikipedia-validation.yaml --output=test-special-chars`

## Comportamento Esperado
O sistema deveria codificar corretamente os caracteres especiais nas URLs antes da navegação (usando encodeURIComponent ou função equivalente) e lidar adequadamente com a extração de dados de páginas com conteúdo multilíngue.

## Comportamento Atual
Ao analisar os logs, observamos problemas como:
1. URLs com caracteres especiais não são codificadas corretamente
2. Navegação parcial bem-sucedida, como para "José Saramago", mas falhas para outros caracteres especiais
3. Extração de dados inconsistente de páginas com conteúdo internacional

## Impacto
Alto - A falha no tratamento adequado de caracteres especiais limita significativamente a utilidade da ferramenta em contextos multilíngues ou internacionais, o que é um requisito comum para muitas aplicações de validação de dados.

## Solução Proposta
1. Implementar codificação adequada de URLs usando `encodeURIComponent` ou biblioteca equivalente
2. Garantir que todos os textos sejam tratados como UTF-8 em todo o fluxo de dados
3. Adicionar suporte explícito para comparação de strings com caracteres acentuados no módulo de validação
4. Implementar normalização de caracteres para comparações mais precisas (por exemplo, converter acentos para formas básicas quando necessário)

## Evidência
Nos logs do sistema, podemos observar a navegação bem-sucedida para a URL com caracteres especiais (José Saramago), embora outras URLs tenham apresentado problemas:

```
{"level":"info","loadTime":2993,"message":"Navigation completed","redirectCount":4,"service":"datahawk","status":200,"timestamp":"2025-07-20T03:17:50.118Z","url":"https://pt.wikipedia.org/wiki/Jos%C3%A9_Saramago"}
```

Note que o sistema conseguiu navegar para a página de José Saramago, mas o URL foi codificado automaticamente pelo navegador para "Jos%C3%A9_Saramago". Isso sugere que o sistema pode não estar tratando adequadamente a codificação de URLs antes de enviá-las ao navegador, confiando na codificação automática que nem sempre é confiável para todos os caracteres especiais. 