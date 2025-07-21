# Guia de Configuração do DataHawk

## Formato de Configuração

O DataHawk utiliza arquivos YAML para configuração. É **fundamental** seguir o padrão de nomenclatura em `snake_case` para todas as chaves de configuração.

### ✅ Formato Correto (snake_case)

```yaml
target_url: "https://example.com"
field_mappings:
  - csv_field: "name"
    web_selector: "h1"
    field_type: "text"
    required: true
    validation_strategy: "dom_extraction"
```

### ❌ Formato Incorreto (camelCase)

```yaml
targetUrl: "https://example.com"
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "text"
    required: true
    validationStrategy: "dom_extraction"
```

## Estrutura de Configuração

### Configuração Completa

```yaml
# URL alvo para validação (pode conter templates como {id})
target_url: "https://example.com/user/{id}"

# Mapeamento entre campos CSV e seletores web
field_mappings:
  - csv_field: "name" # Nome do campo no CSV
    web_selector: "h1" # Seletor CSS para extração
    field_type: "text" # Tipo do campo (text, email, phone, etc)
    required: true # Se o campo é obrigatório
    validation_strategy: "dom_extraction" # Estratégia de validação

# Regras de validação
validation_rules:
  # Configurações de confiança
  confidence:
    minimum_overall: 0.8 # Confiança mínima geral
    minimum_field: 0.7 # Confiança mínima por campo
    ocr_threshold: 0.6 # Limite para OCR
    fuzzy_match_threshold: 0.85 # Limite para correspondência aproximada

  # Configurações de correspondência aproximada
  fuzzy_matching:
    enabled: true
    algorithms: ["levenshtein", "jaro_winkler"]
    string_similarity_threshold: 0.85
    number_tolerance: 0.001
    case_insensitive: true
    ignore_whitespace: true

  # Normalização de dados
  normalization:
    whitespace:
      trim_leading: true
      trim_trailing: true
      normalize_internal: true
    case:
      email: "lowercase"
      name: "title_case"
      text: "preserve"
    special_characters:
      remove_accents: true
      normalize_quotes: true
      normalize_dashes: true
    numbers:
      decimal_separator: "."
      thousand_separator: ","
      currency_symbol_remove: true
    dates:
      target_format: "YYYY-MM-DD"
      input_formats: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]

  # Tratamento de erros
  error_handling:
    max_retry_attempts: 3
    retry_delay_ms: 2000
    exponential_backoff: true
    critical_errors: ["navigation_timeout", "page_not_found"]
    recoverable_errors: ["element_not_found", "ocr_low_confidence"]
    escalation_threshold: 0.1

# Configurações de performance
performance:
  batch_processing: true
  batch_size: 10
  parallel_workers: 3
  caching:
    dom_snapshots: true
    ocr_results: true
    validation_decisions: false
    ttl: 3600
  timeouts:
    navigation: 30000
    dom_extraction: 15000
    ocr_processing: 45000
    validation_decision: 30000
    evidence_collection: 10000

# Configurações de evidência
evidence:
  retention_days: 30
  screenshot_enabled: true
  dom_snapshot_enabled: true
  compression_enabled: true
  include_in_reports: true
```

## Validação de Configuração

O DataHawk valida rigorosamente a configuração antes de iniciar o processamento. Erros comuns incluem:

1. Formato incorreto das chaves (camelCase em vez de snake_case)
2. Campos obrigatórios ausentes
3. Valores inválidos para enums (como field_type ou validation_strategy)
4. URLs inválidas

### Mensagens de Erro

Quando a validação falha, uma mensagem de erro detalhada é exibida, como:

```
Configuration validation failed: field_mappings.0.field_type: Invalid enum value. Expected 'text' | 'email' | 'phone' | 'currency' | 'date' | 'name' | 'address' | 'number' | 'boolean', received 'string'
```

## Boas Práticas

1. **Sempre use snake_case** para chaves de configuração
2. **Valide a configuração** antes de executar processamentos longos
3. **Mantenha configurações separadas** para ambientes diferentes (dev, test, prod)
4. **Use variáveis de ambiente** para valores sensíveis ou específicos do ambiente
