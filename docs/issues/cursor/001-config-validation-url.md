# Problema #001: Validação de URL na Configuração

## Descrição
O sistema apresenta um erro na validação de URL quando o esquema do protocolo (https://) não está presente. Durante os testes, ao utilizar um template de URL com variáveis como `{url}` sem especificar o protocolo, a validação falha com a mensagem "Invalid url".

## Reprodução
1. Criar um arquivo de configuração com o seguinte formato:
```yaml
targetUrl: '{url}'
```
2. Executar o comando: `npm start -- config --validate --path=config/wikipedia-validation.yaml`
3. O sistema retorna o erro: `Configuration validation failed: targetUrl: Invalid url`

## Comportamento Esperado
O sistema deveria aceitar templates de URL para substituição dinâmica, mesmo quando o esquema do protocolo não é especificado no template, uma vez que o valor real será fornecido durante a execução.

## Comportamento Atual
O sistema rejeita templates de URL sem o esquema de protocolo, exigindo que o URL comece com "http://" ou "https://", mesmo quando se trata de um template com variáveis que serão substituídas durante a execução.

## Impacto
Médio - Impede a configuração de cenários onde o URL completo está armazenado em uma coluna do CSV de entrada, exigindo que o usuário faça alterações na configuração para incluir o protocolo explicitamente.

## Solução Proposta
Modificar o validador de URL no arquivo `src/core/config-manager.ts` para aceitar templates de URL com variáveis, verificando apenas se o URL é válido após a substituição das variáveis e não durante a validação da configuração.

## Evidência
```
🔍 Validating configuration: config/wikipedia-validation.yaml
❌ Configuration validation failed:
Configuration validation failed: targetUrl: Invalid url
``` 