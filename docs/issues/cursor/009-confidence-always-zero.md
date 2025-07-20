# Problema #009: Confiança Sempre Zero nos Relatórios

## Descrição
O sistema reporta um nível de confiança de 0% para todas as validações nos relatórios gerados, mesmo quando a validação é bem-sucedida.

## Reprodução
1. Executar o comando de validação: `npm start -- validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia`
2. Verificar o relatório HTML ou JSON gerado

## Comportamento Esperado
O sistema deveria calcular e exibir um valor de confiança baseado na qualidade da correspondência entre os dados do CSV e os dados extraídos da web, com valores variando de 0 a 100%.

## Comportamento Atual
O sistema reporta um nível de confiança de 0% para todas as validações, como mostrado no relatório HTML:
- Na seção de resumo: `<div class="metric-value">0%</div><div>Avg Confidence</div>`
- Na tabela de resultados, para cada linha: `<span class="confidence confidence-low">0%</span>`
- No JSON de relatório: `"averageConfidence": 0` e `"overallConfidence": 0` para cada resultado

## Impacto
Alto - A confiança é uma métrica fundamental para avaliar a qualidade das validações. Sem esta informação, os usuários não podem diferenciar entre correspondências de alta e baixa qualidade, tornando os resultados da validação menos confiáveis e úteis.

## Solução Proposta
1. Investigar o código em `src/llm/local-llm-engine.ts` para garantir que os valores de confiança retornados pelo LLM estão sendo corretamente capturados e processados
2. Verificar o cálculo de confiança geral em `src/core/taskmaster.js` ou classe equivalente
3. Garantir que os valores de confiança estão sendo corretamente propagados para o gerador de relatórios
4. Implementar valores de confiança padrão para casos onde o LLM não retorna um valor explícito

## Evidência
Trecho do relatório HTML gerado:
```html
<div class="summary">
    <div class="metric success">
        <div class="metric-value">5</div>
        <div>Rows Processed</div>
    </div>
    <div class="metric success">
        <div class="metric-value">100%</div>
        <div>Success Rate</div>
    </div>
    <div class="metric error">
        <div class="metric-value">0%</div>
        <div>Avg Confidence</div>
    </div>
    <!-- ... -->
</div>
```

Trecho do relatório JSON:
```json
"summary": {
  "totalRows": 5,
  "processedRows": 5,
  "successfulValidations": 5,
  "failedValidations": 0,
  "averageConfidence": 0,
  "processingTime": 508761,
  "errorRate": 0
}
``` 