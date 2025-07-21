#!/bin/bash

# Comandos rápidos para o Cursor

# Função para mostrar ajuda
function show_help {
  echo "Comandos disponíveis:"
  echo "  cursor:test       - Executa testes unitários"
  echo "  cursor:test:int   - Executa testes de integração"
  echo "  cursor:test:all   - Executa todos os testes"
  echo "  cursor:validate   - Valida arquivos de configuração"
  echo "  cursor:convert    - Converte arquivos de configuração para snake_case"
  echo "  cursor:analyze    - Analisa complexidade do código"
  echo "  cursor:coverage   - Gera relatório de cobertura de testes"
  echo "  cursor:help       - Mostra esta ajuda"
}

# Função para executar testes unitários
function run_unit_tests {
  echo "🧪 Executando testes unitários..."
  npm run test:unit
}

# Função para executar testes de integração
function run_integration_tests {
  echo "🧪 Executando testes de integração..."
  npm run test:integration
}

# Função para executar todos os testes
function run_all_tests {
  echo "🧪 Executando todos os testes..."
  npm test
}

# Função para validar configurações
function validate_configs {
  echo "🔍 Validando arquivos de configuração..."
  npm run config:validate
}

# Função para converter configurações
function convert_configs {
  echo "🔄 Convertendo arquivos de configuração para snake_case..."
  npm run config:convert
}

# Função para analisar complexidade
function analyze_complexity {
  echo "📊 Analisando complexidade do código..."
  npx ts-complexity-analysis src/
}

# Função para gerar relatório de cobertura
function generate_coverage {
  echo "📝 Gerando relatório de cobertura de testes..."
  npm test -- --coverage
}

# Processar comando
case "$1" in
  "cursor:test")
    run_unit_tests
    ;;
  "cursor:test:int")
    run_integration_tests
    ;;
  "cursor:test:all")
    run_all_tests
    ;;
  "cursor:validate")
    validate_configs
    ;;
  "cursor:convert")
    convert_configs
    ;;
  "cursor:analyze")
    analyze_complexity
    ;;
  "cursor:coverage")
    generate_coverage
    ;;
  "cursor:help" | *)
    show_help
    ;;
esac
