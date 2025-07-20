# BUG-024: Parâmetros de URL não são substituídos corretamente

## Descrição
Durante o teste Wikipedia, o sistema não substitui os parâmetros de URL corretamente, resultando em navegação para URLs literais com placeholders, gerando erro 404 em todas as tentativas.

## Reprodução
1. Executar `node dist/main.js validate --input data/wikipedia-test.csv --config config/wikipedia-validation.yaml --output test-wikipedia-new --format json,html`
2. URLs navegadas são: `https://pt.wikipedia.org/wiki/%7Btitulo%7D` (literal)
3. Deveria ser: `https://pt.wikipedia.org/wiki/Brasil`, `https://pt.wikipedia.org/wiki/Portugal`, etc.

## Logs de Erro
```
[32minfo[39m: Navigation completed {"loadTime":3168,"redirectCount":2,"service":"datahawk","status":404,"timestamp":"2025-07-20T06:30:52.271Z","url":"https://pt.wikipedia.org/wiki/%7Btitulo%7D"}
```

## Análise Detalhada
1. **Configuração:** `targetUrl: 'https://pt.wikipedia.org/wiki/{titulo}'`
2. **CSV tem campo:** `articleName` (primeira coluna)
3. **Placeholder esperado:** `{titulo}` mas não encontra campo correspondente
4. **URL codificada:** `%7Btitulo%7D` = `{titulo}` URL-encoded

## Problemas Identificados
1. **Mismatch de campo**: Configuração espera `titulo` mas CSV tem `articleName`
2. **Substituição de parâmetros falha**: Sistema não faz interpolação da URL
3. **Falso positivo de sucesso**: 100% sucesso mesmo com todos 404s
4. **Falta validação de configuração**: Não detecta campos ausentes

## Impacto
- Alto - Funcionalidade principal de substituição de parâmetros não funciona
- Testes Wikipedia inválidos
- Sistema reporta falso sucesso
- Configurações incompatíveis passam despercebidas

## Comportamento Observado vs Esperado

### Observado:
- URL: `https://pt.wikipedia.org/wiki/%7Btitulo%7D` (404)
- Status: success rate 100%
- Campos extraídos: 2/3 successful

### Esperado:
- URL: `https://pt.wikipedia.org/wiki/Brasil`
- Status: Navegação bem-sucedida ou erro de configuração
- Validação adequada de mapeamento de campos

## Localização
- Sistema de substituição de parâmetros de URL
- Validação de configuração vs CSV headers
- Navegação do browser agent

## Prioridade
🔴 Crítica - Funcionalidade core de substituição URL falha

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:31:XX

## Tipo de Teste
- [ ] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [x] Integração
- [ ] Massivo/Stress

## Sugestões de Correção
1. Implementar validação de mapeamento campo CSV vs parâmetros URL
2. Melhorar sistema de substituição de parâmetros
3. Adicionar logs detalhados sobre substituição de URLs
4. Corrigir correspondência entre configuração e CSV headers