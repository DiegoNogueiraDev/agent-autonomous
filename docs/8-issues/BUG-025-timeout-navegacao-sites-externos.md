# BUG-025: Timeout de navegação consistente em sites externos

## Descrição
Sistema apresenta timeouts consistentes de 30 segundos ao tentar navegar para sites externos como emojipedia.org, impedindo a execução de testes com caracteres especiais e outros sites externos.

## Reprodução
1. Executar teste com site externo: `node dist/main.js validate --input data/special-chars-test.csv --config config/special-chars-test.yaml --output test-special-chars-new --format json,html`
2. Sistema tenta navegar para `https://emojipedia.org/search?q=heart`
3. Timeout após 30 segundos: "page.goto: Timeout 30000ms exceeded"
4. Processo se repete para todas as URLs

## Logs de Erro
```
[31merror[39m: Navigation failed {"error":{"error":"page.goto: Timeout 30000ms exceeded.\nCall log:\n\u001b[2m  - navigating to \"https://emojipedia.org/search?q=heart\", waiting until \"networkidle\"\u001b[22m\n","loadTime":30003,"url":"https://emojipedia.org/search?q={searchTerm}"},"service":"datahawk","timestamp":"2025-07-20T06:34:52.625Z"}
```

## Padrão Observado
1. **Sites gov.br**: Timeouts e status 404
2. **Sites Wikipedia**: Status 404 com placeholder não substituído  
3. **Sites externos (emojipedia)**: Timeouts consistentes
4. **Sites locais/exemplo**: Funcionam normalmente

## Impacto
- Alto - Impede validação em sites externos reais
- Limita funcionalidade a sites locais ou de teste
- Torna sistema inadequado para uso produtivo
- Pode indicar problemas de rede, proxy ou DNS

## Análise Técnica
1. **Timeout configurado**: 30000ms (30s)
2. **Estratégia**: `waiting until "networkidle"`
3. **Comportamento**: Timeout consistente, não intermitente
4. **Possíveis causas**:
   - Bloqueio de user-agent
   - Limitação de rate-limiting
   - Problemas de proxy/firewall
   - Sites com proteção anti-bot

## Comportamento com Diferentes Sites
- ✅ `https://example.com` - Funciona
- ❌ `https://www.gov.br/*` - 404 ou timeout
- ❌ `https://pt.wikipedia.org/*` - 404 (URL malformada)
- ❌ `https://emojipedia.org/*` - Timeout consistente

## Localização
- Navegação do browser agent
- Configuração de timeouts
- Possível problema de rede/proxy

## Prioridade
🔴 Alta - Impede testes com sites reais

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:35:XX

## Tipo de Teste
- [ ] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [x] Integração
- [x] Massivo/Stress

## Sugestões de Investigação
1. Verificar se há proxy/firewall bloqueando
2. Testar com diferentes user-agents
3. Implementar retry com backoff para sites externos
4. Adicionar configuração específica para sites conhecidamente lentos
5. Verificar se problema é específico do ambiente ou geral