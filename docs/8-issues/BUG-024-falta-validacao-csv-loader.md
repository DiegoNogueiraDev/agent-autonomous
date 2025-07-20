# BUG-024: Falta de Validação Adequada no CSV Loader

## Descrição
O componente de carregamento de CSV não implementa validações adequadas para arquivos CSV com formatação inválida, tamanhos extremos, ou cabeçalhos ausentes. Isso pode causar falhas durante a execução quando arquivos CSV malformados são processados.

## Reprodução
1. Tentar carregar um arquivo CSV sem cabeçalhos usando o sistema
2. Tentar carregar um arquivo CSV com linhas vazias no meio do arquivo
3. Tentar carregar um arquivo CSV com delimitadores inconsistentes
4. Verificar que erros não são tratados adequadamente

## Impacto
- Médio - causa falhas durante a execução
- Erros genéricos difíceis de interpretar para o usuário
- Possibilidade de interpretação incorreta dos dados

## Análise
Analisando o código do `csv-loader.ts`, foi identificada a falta de:
1. Validação prévia da estrutura do arquivo antes do processamento
2. Verificação explícita de cabeçalhos
3. Normalização de delimitadores
4. Tratamento de linhas vazias ou malformadas
5. Limite de tamanho para evitar problemas de memória

## Localização
`src/core/csv-loader.ts`

## Prioridade
🟠 Alta - Afeta funcionalidade básica

## Status
🔴 Aberto

## Reportado em
2025-07-21T08:XX:XX

## Tipo de Teste
- [x] Funcionalidade Básica
- [ ] Comportamento do Usuário
- [ ] Integração
- [ ] Massivo/Stress

## Solução Proposta
1. Implementar validação prévia do arquivo CSV:
```typescript
async validateCsvFile(filePath: string): Promise<ValidationResult> {
  try {
    // Verificar tamanho do arquivo
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_CSV_SIZE) {
      return { valid: false, errors: ['Arquivo CSV muito grande'] };
    }

    // Verificar cabeçalhos e estrutura
    const sample = await this.readSampleLines(filePath, 10);
    const headers = this.extractHeaders(sample[0]);

    if (headers.length === 0) {
      return { valid: false, errors: ['Cabeçalhos ausentes ou inválidos'] };
    }

    // Verificar consistência de delimitadores
    const columnCounts = sample.map(line => line.split(this.delimiter).length);
    const isConsistent = columnCounts.every(count => count === columnCounts[0]);

    if (!isConsistent) {
      return { valid: false, errors: ['Delimitadores inconsistentes'] };
    }

    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [`Erro ao validar CSV: ${error instanceof Error ? error.message : 'Erro desconhecido'}`]
    };
  }
}
```

2. Melhorar o tratamento de erros específicos para CSVs
3. Adicionar normalização de dados durante o carregamento
4. Implementar limites de segurança configuráveis
