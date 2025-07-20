#!/bin/bash

# DataHawks Cursor IDE Commands
# Comandos para facilitar o desenvolvimento com Cursor IDE

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função de ajuda
show_help() {
    echo -e "${GREEN}DataHawks Cursor Commands${NC}"
    echo "Comandos para desenvolvimento otimizado:"
    echo ""
    echo -e "${YELLOW}Desenvolvimento:${NC}"
    echo "  cursor:dev:build      - Build do projeto"
    echo "  cursor:dev:watch      - Build em modo watch"
    echo "  cursor:dev:clean      - Limpar build"
    echo ""
    echo -e "${YELLOW}Testes:${NC}"
    echo "  cursor:test:unit      - Rodar testes unitários"
    echo "  cursor:test:watch     - Testes em modo watch"
    echo "  cursor:test:e2e       - Rodar testes E2E"
    echo "  cursor:test:coverage  - Ver cobertura de testes"
    echo ""
    echo -e "${YELLOW}Qualidade:${NC}"
    echo "  cursor:lint:check     - Verificar lint"
    echo "  cursor:lint:fix       - Corrigir lint automaticamente"
    echo "  cursor:quality:check  - Verificar qualidade completa"
    echo "  cursor:analyze        - Analisar complexidade"
    echo ""
    echo -e "${YELLOW}Refatoração:${NC}"
    echo "  cursor:refactor:check - Verificar necessidade de refatoração"
    echo "  cursor:refactor:split - Sugerir divisão de arquivos grandes"
}

# Função para verificar tamanho de arquivos
check_file_sizes() {
    echo -e "${YELLOW}Verificando tamanho de arquivos...${NC}"
    find src -name "*.ts" -type f -exec wc -l {} + | awk '$1 > 400 {print "\033[1;33m" $1 " linhas: " $2 "\033[0m"} $1 > 600 {print "\033[0;31m" $1 " linhas: " $2 " - PRECISA REFATORAR!\033[0m"}'
}

# Função para verificar complexidade
check_complexity() {
    echo -e "${YELLOW}Analisando complexidade...${NC}"
    npx ts-node scripts/analyze-complexity.ts
}

# Função para rodar qualidade completa
run_quality_check() {
    echo -e "${GREEN}Executando verificação de qualidade...${NC}"

    echo -e "${YELLOW}1. TypeScript check...${NC}"
    npm run type-check

    echo -e "${YELLOW}2. Lint check...${NC}"
    npm run lint

    echo -e "${YELLOW}3. Testes unitários...${NC}"
    npm run test

    echo -e "${YELLOW}4. Verificando tamanho de arquivos...${NC}"
    check_file_sizes

    echo -e "${GREEN}✅ Qualidade verificada!${NC}"
}

# Main script
case "$1" in
    "dev:build")
        npm run build
        ;;
    "dev:watch")
        npm run dev
        ;;
    "dev:clean")
        rm -rf dist/
        rm -rf coverage/
        echo -e "${GREEN}✅ Build limpo!${NC}"
        ;;
    "test:unit")
        npm run test
        ;;
    "test:watch")
        npm run test:watch
        ;;
    "test:e2e")
        npm run test:e2e
        ;;
    "test:coverage")
        npm run test:coverage
        ;;
    "lint:check")
        npm run lint
        ;;
    "lint:fix")
        npm run lint:fix
        ;;
    "quality:check")
        run_quality_check
        ;;
    "analyze")
        check_complexity
        ;;
    "refactor:check")
        check_file_sizes
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo -e "${RED}Comando não reconhecido${NC}"
        show_help
        exit 1
        ;;
esac
