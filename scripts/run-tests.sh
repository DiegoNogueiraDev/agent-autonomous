#!/bin/bash

# DataHawk - Script para Executar Testes
# Configura o ambiente e executa os testes

set -e

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para mostrar ajuda
function show_help {
  echo -e "${GREEN}DataHawk Test Runner${NC}"
  echo ""
  echo "Uso: $0 [opções]"
  echo ""
  echo "Opções:"
  echo "  --unit        Executa apenas testes unitários"
  echo "  --integration Executa apenas testes de integração"
  echo "  --all         Executa todos os testes (padrão)"
  echo "  --coverage    Gera relatório de cobertura"
  echo "  --setup-only  Apenas configura o ambiente sem executar testes"
  echo "  --help        Mostra esta ajuda"
  echo ""
}

# Processar argumentos
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_COVERAGE=false
SETUP_ONLY=false

if [ $# -eq 0 ]; then
  RUN_UNIT=true
  RUN_INTEGRATION=true
fi

for arg in "$@"
do
  case $arg in
    --unit)
      RUN_UNIT=true
      ;;
    --integration)
      RUN_INTEGRATION=true
      ;;
    --all)
      RUN_UNIT=true
      RUN_INTEGRATION=true
      ;;
    --coverage)
      RUN_COVERAGE=true
      ;;
    --setup-only)
      SETUP_ONLY=true
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo -e "${RED}Opção desconhecida: $arg${NC}"
      show_help
      exit 1
      ;;
  esac
done

# Compilar o projeto
echo -e "${YELLOW}Compilando o projeto...${NC}"
npm run build

# Configurar ambiente de teste
echo -e "${YELLOW}Configurando ambiente de teste...${NC}"
./scripts/setup-test-env.sh

if [ "$SETUP_ONLY" = true ]; then
  echo -e "${GREEN}Ambiente configurado. Saindo sem executar testes.${NC}"
  exit 0
fi

# Executar testes
if [ "$RUN_UNIT" = true ]; then
  echo -e "${YELLOW}Executando testes unitários...${NC}"
  if [ "$RUN_COVERAGE" = true ]; then
    npm run test:unit -- --coverage
  else
    npm run test:unit
  fi
fi

if [ "$RUN_INTEGRATION" = true ]; then
  echo -e "${YELLOW}Executando testes de integração...${NC}"
  if [ "$RUN_COVERAGE" = true ]; then
    npm run test:integration -- --coverage
  else
    npm run test:integration
  fi
fi

echo -e "${GREEN}Testes concluídos!${NC}"
