# BUG-011: Truncamento de Dados em Relatórios HTML com Objetos Grandes

## Descrição
O gerador de relatórios HTML do DataHawk trunca ou falha ao renderizar corretamente grandes objetos JSON, especialmente evidências com dados DOM extensos ou screenshots codificados em base64. Isso resulta em relatórios HTML incompletos ou corrompidos quando o tamanho dos dados excede determinados limites.

## Passos para Reprodução
1. Executar validação com coleta completa de evidências (DOM snapshots e screenshots)
2. Gerar um relatório no formato HTML com o ReportGenerator
3. Verificar que certos objetos são renderizados incorretamente ou truncados no HTML

## Comportamento Esperado
O relatório HTML deve renderizar corretamente todos os dados, independentemente do tamanho, utilizando estratégias como paginação, carregamento lazy, ou compressão adequada de dados.

## Comportamento Atual
Analisando o `generateHtmlReport` no arquivo `src/reporting/report-generator.ts`, vemos que o método concatena diretamente grandes objetos JSON no HTML:

```typescript
private generateHtmlReport(report: Report): string {
  // Truncado para brevidade

  // Parte problemática:
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataHawk Validation Report</title>
      <style>/* Estilos CSS */</style>
  </head>
  <body>
      <!-- Conteúdo HTML -->

      <!-- Problema aqui: dados grandes sendo inseridos diretamente no HTML -->
      <script>
      const reportData = ${JSON.stringify(report)};
      // Resto do script...
      </script>
  </body>
  </html>
  `;
}
```

Este código tenta inserir todo o objeto `report` diretamente no HTML como uma variável JavaScript, o que pode causar:
1. Truncamento de strings (especialmente base64) se forem muito grandes
2. Problemas de escape de caracteres especiais como `</script>`
3. Problemas de memória no navegador ao carregar o relatório
4. Erros de sintaxe JavaScript se houver caracteres especiais ou sequências inválidas

## Ambiente
- Browsers: Chrome, Firefox, Safari
- Node.js: v18+
- Tamanho de evidências: Relatórios com mais de 5MB de dados combinados

## Evidências
1. O código não implementa nenhum mecanismo para lidar com objetos grandes:
```typescript
// Insere dados diretamente no HTML sem tratamento para tamanho
const reportData = ${JSON.stringify(report)};
```

2. Quando inspecionamos relatórios HTML grandes, encontramos strings truncadas e objetos base64 incompletos
3. O tamanho do HTML cresce linearmente com o número de evidências coletadas

## Possível Solução
1. **Separar dados do HTML**:
```typescript
private async generateHtmlReport(report: Report, outputPath: string): Promise<string> {
  // Extrair o caminho de base do relatório HTML
  const basePath = dirname(outputPath);
  const reportId = report.id;

  // Salvar dados em um arquivo JSON separado
  const dataPath = join(basePath, `${reportId}-data.json`);
  await writeFile(dataPath, JSON.stringify(report), 'utf-8');

  // Calcular caminho relativo para o HTML
  const relativeDataPath = `./${basename(dataPath)}`;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataHawk Validation Report</title>
      <style>/* Estilos CSS */</style>
  </head>
  <body>
      <!-- Conteúdo HTML -->

      <!-- Carrega dados de um arquivo externo -->
      <script>
      fetch('${relativeDataPath}')
        .then(response => response.json())
        .then(data => {
          window.reportData = data;
          renderReport(data);
        })
        .catch(error => console.error('Failed to load report data:', error));

      function renderReport(data) {
        // Renderização JavaScript aqui
      }
      </script>
  </body>
  </html>
  `;
}
```

2. **Implementar carregamento parcial e lazy**:
```typescript
private async generateHtmlReport(report: Report, outputPath: string): Promise<string> {
  // Extrair dados de resumo (leves)
  const reportSummary = {
    id: report.id,
    timestamp: report.timestamp,
    summary: report.summary,
    statistics: report.statistics
  };

  // Separar resultados detalhados
  const resultsPath = join(dirname(outputPath), `${report.id}-results.json`);
  await writeFile(resultsPath, JSON.stringify(report.results), 'utf-8');

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <!-- Cabeçalho HTML -->
  </head>
  <body>
      <!-- Conteúdo HTML -->

      <script>
      // Dados de resumo leves incorporados diretamente
      const reportSummary = ${JSON.stringify(reportSummary)};

      // Função para carregar detalhes sob demanda
      async function loadDetails() {
        const resultsResponse = await fetch('${basename(resultsPath)}');
        const results = await resultsResponse.json();

        // Renderizar detalhes aqui
      }

      // Inicializar interface
      renderSummary(reportSummary);

      // Adicionar botão para carregar detalhes
      document.getElementById('load-details').addEventListener('click', loadDetails);
      </script>
  </body>
  </html>
  `;
}
```

3. **Comprimir e fragmentar evidências grandes**:
```typescript
private async processEvidencesForHTML(report: Report, outputPath: string): Promise<void> {
  const evidenceDir = join(dirname(outputPath), 'evidence');
  await mkdir(evidenceDir, { recursive: true });

  // Processar cada resultado com evidências
  for (const result of report.results) {
    if (result.evidenceId) {
      // Extrair screenshots para arquivos individuais
      for (const [i, screenshot] of (result.webData?.screenshots || []).entries()) {
        const imageFileName = `${result.evidenceId}-screenshot-${i}.png`;
        const imagePath = join(evidenceDir, imageFileName);

        // Decodificar base64 e salvar como arquivo
        if (screenshot.base64Data) {
          await writeFile(imagePath, Buffer.from(screenshot.base64Data, 'base64'));

          // Substituir dados base64 com caminho relativo
          screenshot.base64Data = '';
          screenshot.filePath = `evidence/${imageFileName}`;
        }
      }

      // Comprimir e salvar DOM snapshots grandes
      if (result.webData?.pageMetadata?.domSnapshot) {
        const snapshotFileName = `${result.evidenceId}-dom.json.gz`;
        const snapshotPath = join(evidenceDir, snapshotFileName);

        const zlib = await import('zlib');
        const { promisify } = await import('util');
        const gzip = promisify(zlib.gzip);

        const compressed = await gzip(Buffer.from(
          JSON.stringify(result.webData.pageMetadata.domSnapshot)
        ));

        await writeFile(snapshotPath, compressed);

        // Substituir DOM snapshot com referência
        result.webData.pageMetadata.domSnapshot = null;
        result.webData.pageMetadata.domSnapshotPath = `evidence/${snapshotFileName}`;
      }
    }
  }
}
```

## Notas Adicionais
Este problema se torna mais crítico à medida que a quantidade de dados processados aumenta. Os relatórios HTML são uma interface importante para usuários finais interpretarem resultados, então garantir que funcionem corretamente com grandes volumes de dados é essencial para a usabilidade do sistema.

A solução ideal não apenas garantirá que o HTML seja válido, mas também melhorará o desempenho do relatório em navegadores, permitindo carregar e visualizar relatórios com milhares de linhas e numerosas evidências sem problemas de performance.
