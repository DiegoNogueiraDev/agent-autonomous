# BUG-023: Timeout de navegação em sites gov.br

## Descrição
Durante testes com sites do governo brasileiro (gov.br), o sistema apresenta timeouts frequentes de navegação (30s) e falhas de captura de screenshot, mesmo com configurações específicas de timeout estendido.

## Reprodução
1. Executar `node dist/main.js validate --input data/gov-br-test.csv --config config/gov-br-test.yaml --output test-gov-br-new --format json,html`
2. Sistema navega mas retorna status 404 para todas as URLs
3. Timeout na captura de screenshot: "page.screenshot: Timeout 30000ms exceeded"

## Logs de Erro
```
[31merror[39m: Navigation failed {"error":{"error":"page.goto: Timeout 30000ms exceeded.\nCall log:\n\u001b[2m  - navigating to \"https://www.gov.br/pt-br/servicos/obter-passaporte\", waiting until \"networkidle\"\u001b[22m\n","loadTime":30002,"url":"https://www.gov.br/pt-br/servicos/{serviceCode}"},"service":"datahawk","timestamp":"2025-07-20T06:25:49.393Z"}

[31merror[39m: Screenshot capture failed {"error":"page.screenshot: Timeout 30000ms exceeded.\nCall log:\n\u001b[2m  - taking page screenshot\u001b[22m\n\u001b[2m  - waiting for fonts to load...\u001b[22m\n\u001b[2m  - fonts loaded\u001b[22m\n","service":"datahawk"}
```

## Impacto
- Alto - Impede validação em sites governamentais brasileiros
- Sites gov.br são lentos e complexos, precisam tratamento especial
- Falsa taxa de sucesso (100%) mesmo com todos os 404s
- Tempo de processamento excessivo (81s para 5 linhas)

## Análise
1. **URLs retornam 404**: Possível mudança na estrutura dos links gov.br
2. **Timeouts inadequados**: Sites governamentais precisam timeouts maiores
3. **Screenshot falha mesmo após navegação**: Problema na captura após timeout
4. **Status 404 ignorado**: Sistema não trata adequadamente erros HTTP

## Observações Específicas
- Configuração já tem `navigation: 40000ms` mas ainda assim falha
- Múltiplos redirects (3-4) antes do 404 final
- Sistema reporta "success rate 100%" mesmo com falhas evidentes

## Localização
- Navegação do browser agent
- Captura de screenshots
- Tratamento de erros HTTP

## Prioridade
🔴 Alta - Sites governamentais são casos de uso críticos

## Status
🔴 Aberto

## Reportado em
2025-07-20T06:26:XX

## Tipo de Teste
- [ ] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [x] Integração
- [ ] Massivo/Stress

## Sugestões de Correção
1. Verificar URLs atuais do gov.br
2. Aumentar timeouts para sites governamentais
3. Melhorar tratamento de status HTTP 404
4. Implementar fallback para captura de screenshot após timeout