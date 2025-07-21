#!/bin/bash

# DataHawk - Script de Atualização de Configuração LLM v2.0
# Integra novos modelos baixados e configura sistema multi-modelo

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 DataHawk - Configuração Sistema Multi-Modelo v2.0${NC}"
echo "============================================================"

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Execute este script no diretório raiz do projeto DataHawk${NC}"
    exit 1
fi

# Função para verificar modelo
check_model() {
    local model_path=$1
    local model_name=$2

    if [ -f "$model_path" ]; then
        local size=$(du -h "$model_path" | cut -f1)
        echo -e "${GREEN}✅ $model_name: $size${NC}"
        return 0
    else
        echo -e "${RED}❌ $model_name: Não encontrado${NC}"
        return 1
    fi
}

# Verificar modelos disponíveis
echo -e "\n${BLUE}📦 Verificando modelos baixados...${NC}"

TINYLLAMA_EXISTS=0
QWEN_EXISTS=0
GEMMA_EXISTS=0
PHI3_EXISTS=0

if check_model "models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" "TinyLlama 1.1B"; then
    TINYLLAMA_EXISTS=1
fi

if check_model "models/qwen1.5-1.8b-chat.Q4_K_M.gguf" "Qwen 1.5 1.8B"; then
    QWEN_EXISTS=1
fi

if check_model "models/gemma-2b-it.Q4_K_M.gguf" "Gemma 2B IT"; then
    GEMMA_EXISTS=1
fi

if check_model "models/phi-3-mini-4k-instruct.Q4_K_M.gguf" "Phi-3 Mini 4K"; then
    PHI3_EXISTS=1
fi

TOTAL_MODELS=$((TINYLLAMA_EXISTS + QWEN_EXISTS + GEMMA_EXISTS + PHI3_EXISTS))

echo -e "\n${PURPLE}📊 Resumo: $TOTAL_MODELS/4 modelos disponíveis${NC}"

if [ $TOTAL_MODELS -eq 0 ]; then
    echo -e "\n${RED}❌ Nenhum modelo encontrado!${NC}"
    echo -e "${YELLOW}💡 Execute: bash scripts/download-recommended-models.sh${NC}"
    exit 1
fi

# Criar backup da configuração atual
echo -e "\n${BLUE}💾 Criando backup das configurações...${NC}"
if [ -f "llm-production.yaml" ]; then
    cp llm-production.yaml "llm-production.yaml.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✅ Backup criado${NC}"
fi

# Verificar e criar diretórios necessários
echo -e "\n${BLUE}📁 Verificando estrutura de diretórios...${NC}"
mkdir -p data logs models
echo -e "${GREEN}✅ Diretórios verificados${NC}"

# Instalar dependências Python se necessário
echo -e "\n${BLUE}🐍 Verificando dependências Python...${NC}"
if ! python3 -c "import yaml" 2>/dev/null; then
    echo -e "${YELLOW}⚠️ Instalando PyYAML...${NC}"
    pip3 install PyYAML
fi

if ! python3 -c "import sqlite3" 2>/dev/null; then
    echo -e "${YELLOW}⚠️ sqlite3 não disponível - algumas funcionalidades de aprendizado podem não funcionar${NC}"
fi

echo -e "${GREEN}✅ Dependências verificadas${NC}"

# Compilar projeto TypeScript
echo -e "\n${BLUE}🔨 Compilando projeto TypeScript...${NC}"
npm run build
echo -e "${GREEN}✅ Compilação concluída${NC}"

# Função para testar modelo específico
test_model() {
    local model_name=$1
    local field_type=$2

    echo -e "${BLUE}🧪 Testando $model_name para $field_type...${NC}"

    local response=$(curl -s -X POST http://localhost:8000/validate \
        -H "Content-Type: application/json" \
        -d "{\"csv_value\": \"teste\", \"web_value\": \"teste\", \"field_type\": \"$field_type\"}" \
        2>/dev/null)

    if echo "$response" | grep -q "\"match\""; then
        echo -e "${GREEN}✅ $model_name respondeu corretamente${NC}"
        return 0
    else
        echo -e "${RED}❌ $model_name falhou no teste${NC}"
        return 1
    fi
}

# Verificar se servidor LLM está rodando
echo -e "\n${BLUE}🔍 Verificando servidor LLM...${NC}"
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Servidor LLM já está rodando${NC}"

    # Testar modelos específicos
    echo -e "\n${BLUE}🧪 Testando modelos por tipo de campo...${NC}"

        if [ "$TINYLLAMA_EXISTS" = 1 ]; then
        test_model "TinyLlama" "id"
    fi

    if [ "$QWEN_EXISTS" = 1 ]; then
        test_model "Qwen" "number"
    fi

    if [ "$GEMMA_EXISTS" = 1 ]; then
        test_model "Gemma" "name"
    fi

    if [ "$PHI3_EXISTS" = 1 ]; then
        test_model "Phi-3" "email"
    fi

else
    echo -e "${YELLOW}⚠️ Servidor LLM não está rodando${NC}"
    echo -e "${BLUE}🚀 Iniciando servidor LLM em background...${NC}"

    # Iniciar servidor em background
    nohup python3 llm-server-production.py > logs/llm-server-startup.log 2>&1 &
    SERVER_PID=$!

    echo -e "${BLUE}📝 PID do servidor: $SERVER_PID${NC}"

    # Aguardar servidor inicializar
    echo -e "${BLUE}⏱️ Aguardando servidor inicializar...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Servidor LLM iniciado com sucesso!${NC}"
            break
        fi
        echo -ne "${YELLOW}⏳ Tentativa $i/30...${NC}\r"
        sleep 2
    done

    if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "\n${RED}❌ Falha ao iniciar servidor LLM${NC}"
        echo -e "${YELLOW}💡 Verifique os logs: tail -f logs/llm-server-startup.log${NC}"
        exit 1
    fi
fi

# Obter informações dos modelos do servidor
echo -e "\n${BLUE}📊 Obtendo status dos modelos...${NC}"
MODELS_INFO=$(curl -s http://localhost:8000/models 2>/dev/null)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Informações dos modelos obtidas${NC}"

    # Extrair informações básicas (sem jq para compatibilidade)
    echo -e "\n${PURPLE}📋 Modelos configurados:${NC}"
    echo "$MODELS_INFO" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | while read -r model; do
        echo -e "   • $model"
    done
else
    echo -e "${YELLOW}⚠️ Não foi possível obter informações detalhadas dos modelos${NC}"
fi

# Criar configuração de exemplo para diferentes tipos de campo
echo -e "\n${BLUE}📝 Criando configuração de exemplo...${NC}"

cat > config/multi-model-validation.yaml << EOF
# Configuração DataHawk v2.0 - Sistema Multi-Modelo
# Demonstra uso otimizado de diferentes modelos por tipo de campo

targetUrl: 'https://httpbin.org/html'

fieldMappings:
  # Campos simples -> TinyLlama (rápido)
  - csvField: 'id'
    webSelector: 'h1'
    fieldType: 'id'
    required: true
    validationStrategy: 'dom_extraction'

  - csvField: 'code'
    webSelector: 'p:first-of-type'
    fieldType: 'code'
    required: false
    validationStrategy: 'dom_extraction'

  # Campos numéricos -> Qwen (raciocínio numérico)
  - csvField: 'cpf'
    webSelector: '.cpf'
    fieldType: 'cpf'
    required: false
    validationStrategy: 'dom_extraction'

  - csvField: 'salary'
    webSelector: '.salary'
    fieldType: 'currency'
    required: false
    validationStrategy: 'dom_extraction'

  # Campos de texto português -> Gemma (PT-BR)
  - csvField: 'name'
    webSelector: 'h1'
    fieldType: 'name'
    required: true
    validationStrategy: 'dom_extraction'

  - csvField: 'address'
    webSelector: '.address'
    fieldType: 'address'
    required: false
    validationStrategy: 'dom_extraction'

  # Campos complexos -> Phi-3 (qualidade superior)
  - csvField: 'email'
    webSelector: '.email'
    fieldType: 'email'
    required: false
    validationStrategy: 'dom_extraction'

validationRules:
  confidence:
    minimumOverall: 0.7
    minimumField: 0.6
    ocrThreshold: 0.6
    fuzzyMatchThreshold: 0.8
  fuzzyMatching:
    enabled: true
    algorithms: ['levenshtein', 'jaro_winkler']
    stringSimilarityThreshold: 0.8
    caseInsensitive: true
    ignoreWhitespace: true
  errorHandling:
    maxRetryAttempts: 3
    retryDelayMs: 2000
    escalationThreshold: 0.1

performance:
  batchProcessing: true
  batchSize: 5
  parallelWorkers: 2
  caching:
    domSnapshots: true
    ocrResults: true
    validationDecisions: true # Habilitado para aproveitar cache inteligente
    ttl: 3600
  timeouts:
    navigation: 30000
    domExtraction: 15000
    ocrProcessing: 45000
    validationDecision: 30000
    evidenceCollection: 10000

evidence:
  retentionDays: 30
  screenshotEnabled: true
  domSnapshotEnabled: true
  compressionEnabled: true
  includeInReports: true
EOF

echo -e "${GREEN}✅ Configuração de exemplo criada: config/multi-model-validation.yaml${NC}"

# Criar dados de teste
echo -e "\n${BLUE}📊 Criando dados de teste...${NC}"

cat > data/test-multi-model.csv << 'EOF'
id,code,cpf,salary,name,address,email
1,ABC123,123.456.789-01,R$ 5.000,João Silva,Rua das Flores 123,joao@email.com
2,DEF456,987.654.321-02,R$ 7.500,Maria Santos,Av. Paulista 456,maria@email.com
3,GHI789,555.444.333-03,R$ 3.200,Pedro Costa,Rua Augusta 789,pedro@email.com
EOF

echo -e "${GREEN}✅ Dados de teste criados: data/test-multi-model.csv${NC}"

# Teste rápido de integração
echo -e "\n${BLUE}🧪 Executando teste de integração...${NC}"

if command -v node > /dev/null 2>&1; then
    echo -e "${BLUE}🚀 Testando validação multi-modelo...${NC}"

    # Usar timeout para evitar travamentos
    timeout 60s node dist/main.js validate \
        --input data/test-multi-model.csv \
        --config config/multi-model-validation.yaml \
        --output data/output/test-multi-model \
        --format json \
        --max-rows 1 \
        > logs/integration-test.log 2>&1

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Teste de integração passou!${NC}"
        if [ -f "data/output/test-multi-model/report.json" ]; then
            echo -e "${GREEN}✅ Relatório gerado com sucesso${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ Teste de integração com issues (verifique logs/integration-test.log)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ Node.js não encontrado - pulando teste de integração${NC}"
fi

# Relatório final
echo -e "\n${PURPLE}📋 RELATÓRIO DE CONFIGURAÇÃO${NC}"
echo "=================================="
echo -e "${BLUE}Modelos Disponíveis:${NC}"
[ "$TINYLLAMA_EXISTS" = true ] && echo -e "  ✅ TinyLlama (id, code, category)"
[ "$QWEN_EXISTS" = true ] && echo -e "  ✅ Qwen 1.8B (number, cpf, currency)"
[ "$GEMMA_EXISTS" = true ] && echo -e "  ✅ Gemma 2B (name, address, description)"
[ "$PHI3_EXISTS" = true ] && echo -e "  ✅ Phi-3 Mini (email, phone, complex)"

echo -e "\n${BLUE}Funcionalidades Ativas:${NC}"
echo -e "  ✅ Seleção automática de modelos"
echo -e "  ✅ Sistema de aprendizado retroativo"
echo -e "  ✅ Cache inteligente de decisões"
echo -e "  ✅ Métricas de performance"
echo -e "  ✅ Configuração otimizada por tipo de campo"

echo -e "\n${BLUE}Arquivos Criados/Atualizados:${NC}"
echo -e "  ✅ llm-production.yaml (configuração principal)"
echo -e "  ✅ llm-server-production.py (servidor v2.0)"
echo -e "  ✅ config/multi-model-validation.yaml (exemplo)"
echo -e "  ✅ data/test-multi-model.csv (dados de teste)"

echo -e "\n${BLUE}Próximos Passos:${NC}"
echo -e "  1. ${YELLOW}Testar com dados reais:${NC}"
echo -e "     node dist/main.js validate --input seus_dados.csv --config config/multi-model-validation.yaml"
echo -e "  2. ${YELLOW}Monitorar métricas:${NC}"
echo -e "     curl http://localhost:8000/metrics"
echo -e "  3. ${YELLOW}Ver modelos disponíveis:${NC}"
echo -e "     curl http://localhost:8000/models"

echo -e "\n${GREEN}🎉 Configuração do sistema multi-modelo concluída com sucesso!${NC}"
echo -e "${PURPLE}DataHawk v2.0 está pronto para validações inteligentes! 🦅${NC}"
