#!/bin/bash

# DataHawk - Script de Inicialização de Ambiente de Teste
# Inicia todos os serviços necessários para testes

set -e

echo "🧪 Configurando ambiente de teste DataHawk..."

# Verificar se modelos existem
if [ ! -f "models/phi-3-mini-4k-instruct.Q4_K_M.gguf" ] && \
   [ ! -f "models/gemma-2b-it.Q4_K_M.gguf" ] && \
   [ ! -f "models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" ] && \
   [ ! -f "models/llama3-8b-instruct.Q4_K_M.gguf" ]; then
    echo "❌ Nenhum modelo LLM encontrado!"
    echo "💡 Execute: ./scripts/download-recommended-models.sh"
    exit 1
fi

# Criar diretórios necessários
mkdir -p logs tests/temp data config

# Converter configurações para snake_case
echo "🔄 Convertendo arquivos de configuração para snake_case..."
node_modules/.bin/tsx scripts/convert-config-format.ts

# Iniciar servidor OCR (se necessário)
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo "🔍 Iniciando servidor OCR..."
    cd src/ocr && bash start-python-ocr.sh &
    cd ../..
    sleep 3
fi

# Iniciar servidor LLM
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "🤖 Iniciando servidor LLM..."
    python3 llm-server-production.py &
    sleep 5
fi

# Verificar se serviços estão rodando
echo "🔍 Verificando serviços..."

if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo "✅ Servidor LLM funcionando"
else
    echo "❌ Servidor LLM não está respondendo"
    exit 1
fi

if curl -s http://localhost:5000/health | grep -q "healthy"; then
    echo "✅ Servidor OCR funcionando"
else
    echo "⚠️ Servidor OCR não está respondendo (continuando...)"
fi

# Criar arquivo de configuração temporário para testes
echo "📝 Criando configuração de teste..."
cat > config/test-config.snake.yaml << 'EOL'
target_url: 'https://httpbin.org/html'
field_mappings:
  - csv_field: 'name'
    web_selector: 'h1'
    field_type: 'text'
    required: true
    validation_strategy: 'dom_extraction'
  - csv_field: 'email'
    web_selector: 'p'
    field_type: 'email'
    required: false
    validation_strategy: 'dom_extraction'

validation_rules:
  confidence:
    minimum_overall: 0.8
    minimum_field: 0.7
    ocr_threshold: 0.6
    fuzzy_match_threshold: 0.85
  fuzzy_matching:
    enabled: true
    algorithms: ['levenshtein', 'jaro_winkler']
    string_similarity_threshold: 0.85
    number_tolerance: 0.001
    case_insensitive: true
    ignore_whitespace: true
  normalization:
    whitespace:
      trim_leading: true
      trim_trailing: true
      normalize_internal: true
    case:
      email: 'lowercase'
      name: 'title_case'
      text: 'preserve'
    special_characters:
      remove_accents: true
      normalize_quotes: true
      normalize_dashes: true
    numbers:
      decimal_separator: '.'
      thousand_separator: ','
      currency_symbol_remove: true
    dates:
      target_format: 'YYYY-MM-DD'
      input_formats: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']
  error_handling:
    max_retry_attempts: 3
    retry_delay_ms: 2000
    exponential_backoff: true
    critical_errors: ['navigation_timeout', 'page_not_found']
    recoverable_errors: ['element_not_found', 'ocr_low_confidence']
    escalation_threshold: 0.1

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

evidence:
  retention_days: 30
  screenshot_enabled: true
  dom_snapshot_enabled: true
  compression_enabled: true
  include_in_reports: true
EOL

# Criar arquivo CSV de teste
echo "📝 Criando dados de teste..."
cat > tests/fixtures/test-data.csv << EOL
name,email,id
"John Doe",john@example.com,1
"Jane Smith",jane@example.com,2
"Bob Johnson",bob@example.com,3
EOL

echo ""
echo "🎉 Ambiente de teste configurado com sucesso!"
echo ""
