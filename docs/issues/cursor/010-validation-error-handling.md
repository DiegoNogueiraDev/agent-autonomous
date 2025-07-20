# Problema #010: Tratamento de Erros Detalhado na Validação de Configuração

## Descrição
O sistema reporta múltiplos erros de validação simultaneamente quando um arquivo de configuração contém vários problemas, tornando difícil para o usuário identificar e corrigir os problemas um por um.

## Reprodução
1. Criar um arquivo de configuração com múltiplos erros (como `config/invalid-config.yaml`)
2. Executar o comando: `npm start -- config --validate --path=config/invalid-config.yaml`

## Comportamento Esperado
O sistema deveria identificar os erros de forma estruturada, agrupando-os por seções da configuração e possivelmente oferecendo sugestões de correção. Idealmente, o sistema poderia lidar com erros de forma progressiva, permitindo que o usuário corrija um erro de cada vez.

## Comportamento Atual
O sistema reporta todos os erros encontrados em uma única mensagem longa, sem formatação ou agrupamento adequado, dificultando a identificação e correção dos problemas:

```
Configuration validation failed: fieldMappings.0.fieldType: Invalid enum value. Expected 'text'
 | 'email' | 'phone' | 'currency' | 'date' | 'name' | 'address' | 'number' | 'boolean', receive
d 'invalid_type', fieldMappings.1.fieldType: Required, fieldMappings.2.validationStrategy: Inva
lid enum value. Expected 'dom_extraction' | 'ocr_extraction' | 'hybrid' | 'fuzzy_match', receiv
ed 'invalid_strategy', validationRules.confidence.minimumOverall: Number must be less than or e
qual to 1, validationRules.fuzzyMatching.enabled: Expected boolean, received string, validation
Rules.normalization: Required, validationRules.errorHandling: Required, performance: Required,
evidence: Required
```

## Impacto
Médio - A forma como os erros são apresentados dificulta a correção da configuração, especialmente para usuários menos experientes, levando a uma experiência frustrante e potencialmente a configurações incorretas não identificadas facilmente.

## Solução Proposta
1. Melhorar o formatador de erros do Zod para agrupar erros por seção da configuração
2. Implementar um modo de validação progressiva que identifica um erro por vez
3. Adicionar sugestões de correção para erros comuns (por exemplo, "Invalid enum value" poderia sugerir os valores válidos)
4. Adicionar uma opção `--format json` para retornar erros em formato JSON estruturado para integração com ferramentas externas
5. Implementar uma ferramenta de correção interativa para guiar o usuário através da resolução de problemas

## Evidência
```
🔍 Validating configuration: config/invalid-config.yaml
❌ Configuration validation failed:
Configuration validation failed: fieldMappings.0.fieldType: Invalid enum value. Expected 'text'
 | 'email' | 'phone' | 'currency' | 'date' | 'name' | 'address' | 'number' | 'boolean', receive
d 'invalid_type', fieldMappings.1.fieldType: Required, fieldMappings.2.validationStrategy: Inva
lid enum value. Expected 'dom_extraction' | 'ocr_extraction' | 'hybrid' | 'fuzzy_match', receiv
ed 'invalid_strategy', validationRules.confidence.minimumOverall: Number must be less than or e
qual to 1, validationRules.fuzzyMatching.enabled: Expected boolean, received string, validation
Rules.normalization: Required, validationRules.errorHandling: Required, performance: Required,
evidence: Required
``` 