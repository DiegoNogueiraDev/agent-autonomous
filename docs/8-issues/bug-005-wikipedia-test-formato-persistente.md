# Bug #005: Problema persistente de formatação em CSV com caracteres não-ASCII

## Descrição
Mesmo após a correção do arquivo `wikipedia-test.csv` com aspas adequadas em todos os campos, o sistema continua detectando inconsistências no número de colunas. Isso sugere que o problema pode estar relacionado ao tratamento de caracteres especiais/não-ASCII ou à codificação do arquivo.

## Erro
```
Failed to load CSV file: CSV validation failed: Inconsistent number of columns detected: 6, 8, 8, 8, 6
```

## Passos para reprodução
1. Crie uma versão corrigida do arquivo `wikipedia-test.csv` com todos os campos devidamente escapados com aspas
2. Execute o comando:
```bash
node dist/main.js validate --input data/fixed-wikipedia-test.csv --config config/wikipedia-validation.yaml --output data/qa-results/fixed-wikipedia-test --format json,html
```

## Análise
Ao inspecionar o arquivo com `hexdump`, pode-se observar que:
- O arquivo contém caracteres UTF-8 não-ASCII (acentos, cedilhas, etc.)
- O problema persiste mesmo quando os campos são devidamente escapados com aspas
- O detector de delimitadores e analisador CSV pode estar interpretando incorretamente as sequências UTF-8 multi-byte

Isso sugere que o problema pode estar no próprio parser CSV (PapaParse) e sua capacidade de lidar com texto UTF-8 em algumas condições específicas.

## Impacto
- Impossibilidade de validar arquivos contendo caracteres especiais ou acentuados
- Bloqueia o uso do sistema para dados em português e outros idiomas que não sejam ASCII puro
- Gera frustração para os usuários, uma vez que mesmo tentando corrigir o formato, o erro persiste

## Gravidade
Alta - O sistema não consegue processar dados em português com acentos, o que é um requisito essencial para a validação de conteúdo em português.

## Solução sugerida
1. Verificar a configuração do parser PapaParse para garantir que esteja configurado para UTF-8
```typescript
// No arquivo csv-loader.ts:
const parseResult = Papa.parse<CSVRow>(fileContent, {
  delimiter,
  header: mergedConfig.headers,
  skipEmptyLines: mergedConfig.skipEmptyLines,
  encoding: 'utf-8', // Garantir que a codificação está definida como UTF-8
  // ...
});
```

2. Considerar o uso de outros parsers CSV mais robustos para conteúdo Unicode/UTF-8
3. Implementar uma etapa de pré-processamento que normalize os caracteres especiais ou os converta para entidades HTML
4. Adicionar uma opção para forçar o processamento mesmo com problemas de formatação

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
- Arquivos em codificação UTF-8 com caracteres acentuados
