# Issue 004: Falhas na Análise de Respostas JSON do LLM

## Problema Identificado
O sistema está consistentemente falhando ao analisar respostas JSON do LLM, recaindo para parsing de texto como fallback.

## Detalhes Técnicos
- **Arquivo afetado**: `src/agents/extractor-agent.ts`
- **Erro específico**: `warn: Failed to parse LLM JSON response, trying text parsing`
- **Frequência**: Ocorre em 100% das tentativas de extração
- **Impacto**: Degradação significativa na qualidade da extração de dados

## Padrão de Falha Observado
1. LLM retorna resposta em formato não-JSON ou JSON malformado
2. Sistema tenta parsing de texto como fallback
3. Resultados menos precisos e estruturados

## Possíveis Causas
1. **Formato de prompt inadequado**: O prompt não está instruindo claramente para retornar JSON válido
2. **Modelo LLM inadequado**: O modelo pode não ser capaz de gerar JSON consistentemente
3. **Timeout ou limitações**: Respostas podem estar sendo truncadas
4. **Contexto insuficiente**: Prompt não fornece exemplos suficientes de formato esperado

## Exemplo de Resposta Problemática
```json
// Esperado
{
  "title": "Example Page",
  "description": "This is a test page"
}

// Recebido (malformado)
Title: Example Page
Description: This is a test page
```

## Solução Proposta
1. **Melhorar prompts do sistema**:
   - Adicionar exemplos explícitos de JSON válido
   - Incluir schema JSON no prompt
   - Usar few-shot learning com exemplos

2. **Implementar validação robusta**:
   - Adicionar JSON schema validation
   - Implementar retry com prompts diferentes
   - Usar regex para extrair JSON de texto

3. **Fallback melhorado**:
   - Criar parser estruturado para texto
   - Mapear padrões comuns de resposta
   - Log detalhado para debugging

## Implementação Sugerida
```typescript
// Adicionar em extractor-agent.ts
private async parseLLMResponse(response: string): Promise<ExtractedData> {
  try {
    // Tentar parsing JSON direto
    return JSON.parse(response);
  } catch (error) {
    // Extrair JSON de texto usando regex
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Fallback para parsing estruturado
        return this.parseStructuredText(response);
      }
    }
    return this.parseStructuredText(response);
  }
}
```

## Arquivos para Atualizar
- `src/agents/extractor-agent.ts`
- `src/agents/prompts/extraction-prompts.ts`
- Adicionar testes para diferentes formatos de resposta
