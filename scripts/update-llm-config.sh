#!/bin/bash

# DataHawk - Script para Atualizar Configurações LLM
# Atualiza configurações para usar o novo servidor LLM de produção

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 DataHawk - Atualizando Configurações LLM${NC}"
echo "=============================================="

# Função para backup de arquivo
backup_file() {
    local file=$1
    if [ -f "$file" ]; then
        cp "$file" "$file.backup.$(date +%Y%m%d_%H%M%S)"
        echo -e "${GREEN}✅ Backup criado: $file.backup.$(date +%Y%m%d_%H%M%S)${NC}"
    fi
}

# Função para atualizar configurações TypeScript
update_typescript_configs() {
    echo -e "\n${YELLOW}📝 Atualizando configurações TypeScript...${NC}"

    # Atualizar configurações padrão no taskmaster
    local taskmaster_file="src/core/taskmaster.ts"
    if [ -f "$taskmaster_file" ]; then
        backup_file "$taskmaster_file"

        # Substituir modelo padrão para phi-3-mini
        sed -i 's/modelPath: .\/models\/mistral-7b-instruct-q4_k_m.gguf/modelPath: .\/models\/phi-3-mini-4k-instruct.Q4_K_M.gguf/g' "$taskmaster_file"

        # Reduzir configurações para modelos menores
        sed -i 's/contextSize: 4096/contextSize: 2048/g' "$taskmaster_file"
        sed -i 's/batchSize: 512/batchSize: 128/g' "$taskmaster_file"
        sed -i 's/threads: 4/threads: 3/g' "$taskmaster_file"
        sed -i 's/maxTokens: 512/maxTokens: 10/g' "$taskmaster_file"

        echo -e "${GREEN}✅ Taskmaster atualizado${NC}"
    fi

    # Atualizar crew orchestrator
    local crew_file="src/agents/crew-orchestrator.ts"
    if [ -f "$crew_file" ]; then
        backup_file "$crew_file"

        # Substituir modelos padrão
        sed -i 's/modelPath: .\/models\/llama3-8b-instruct.Q4_K_M.gguf/modelPath: .\/models\/phi-3-mini-4k-instruct.Q4_K_M.gguf/g' "$crew_file"
        sed -i 's/fallbackModelPath: .\/models\/phi-3-mini-4k-instruct.Q4_K_M.gguf/fallbackModelPath: .\/models\/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf/g' "$crew_file"

        # Reduzir configurações
        sed -i 's/contextSize: 8192/contextSize: 2048/g' "$crew_file"
        sed -i 's/batchSize: 512/batchSize: 128/g' "$crew_file"
        sed -i 's/maxTokens: 1024/maxTokens: 10/g' "$crew_file"

        echo -e "${GREEN}✅ Crew Orchestrator atualizado${NC}"
    fi
}

# Função para atualizar configurações YAML
update_yaml_configs() {
    echo -e "\n${YELLOW}📝 Atualizando configurações YAML...${NC}"

    # Buscar arquivos de configuração YAML
    for config_file in config/*.yaml; do
        if [ -f "$config_file" ]; then
            backup_file "$config_file"

            # Não há configurações específicas de LLM nos YAMLs atuais
            # Mas preparar para futuras configurações
            echo -e "${BLUE}ℹ️ Verificado: $config_file${NC}"
        fi
    done
}

# Função para criar arquivo de configuração de produção
create_production_config() {
    echo -e "\n${YELLOW}📝 Criando configuração de produção...${NC}"

    cat > "llm-production.yaml" << EOF
# Configuração LLM de Produção - DataHawk
# Otimizada para modelos pequenos e estáveis

llm:
  # Servidor de produção
  server:
    url: "http://localhost:8000"
    health_check_interval: 30 # segundos
    timeout: 10 # segundos
    max_retries: 3

  # Modelos suportados (em ordem de preferência)
  models:
    - name: "tinyllama"
      path: "models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
      memory_gb: 1.5
      description: "Ultra rápido, baixo consumo"

    - name: "qwen-1.8b"
      path: "models/qwen1.5-1.8b-chat.Q4_K_M.gguf"
      memory_gb: 2.0
      description: "Bom para raciocínio numérico"

    - name: "gemma-2b"
      path: "models/gemma-2b-it.Q4_K_M.gguf"
      memory_gb: 2.5
      description: "Equilibrado, bom PT-BR"

    - name: "phi3-mini"
      path: "models/phi-3-mini-4k-instruct.Q4_K_M.gguf"
      memory_gb: 3.5
      description: "Qualidade superior"

  # Configurações otimizadas
  settings:
    context_size: 2048
    batch_size: 128
    threads: 3
    temperature: 0.1
    max_tokens: 10

  # Validação específica
  validation:
    enable_fallback: true
    confidence_threshold: 0.7
    max_prompt_length: 200
    simple_prompts: true # Para modelos pequenos
EOF

    echo -e "${GREEN}✅ Arquivo llm-production.yaml criado${NC}"
}

# Função para atualizar README
update_readme() {
    echo -e "\n${YELLOW}📝 Atualizando README...${NC}"

    local readme_file="README.md"
    if [ -f "$readme_file" ]; then
        backup_file "$readme_file"

        # Adicionar seção sobre modelos pequenos
        cat >> "$readme_file" << 'EOF'

## 🤖 Modelos LLM Recomendados

O DataHawk agora suporta modelos menores e mais estáveis:

| Modelo | Tamanho | RAM Necessária | Melhor Para |
|--------|---------|----------------|-------------|
| TinyLlama 1.1B | ~0.8GB | 2GB | Validações rápidas, RAM limitada |
| Qwen 1.8B | ~1.2GB | 3GB | Raciocínio numérico, comparações |
| Gemma 2B | ~1.5GB | 3.5GB | Português, validações complexas |
| Phi-3 Mini | ~2.7GB | 4GB | Qualidade superior geral |

### Download Automático

```bash
# Baixar modelos recomendados
chmod +x scripts/download-recommended-models.sh
./scripts/download-recommended-models.sh
```

### Servidor LLM de Produção

```bash
# Iniciar servidor LLM otimizado
python3 llm-server-production.py

# Verificar modelos disponíveis
curl http://localhost:8000/models
```

EOF

        echo -e "${GREEN}✅ README atualizado${NC}"
    fi
}

# Função para criar script de início
create_start_script() {
    echo -e "\n${YELLOW}📝 Criando script de início...${NC}"

    cat > "start-datahawk.sh" << 'EOF'
#!/bin/bash

# DataHawk - Script de Início Completo
# Inicia todos os serviços necessários

set -e

echo "🚀 Iniciando DataHawk..."

# Verificar se modelos existem
if [ ! -f "models/phi-3-mini-4k-instruct.Q4_K_M.gguf" ] && \
   [ ! -f "models/gemma-2b-it.Q4_K_M.gguf" ] && \
   [ ! -f "models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" ]; then
    echo "❌ Nenhum modelo LLM encontrado!"
    echo "💡 Execute: ./scripts/download-recommended-models.sh"
    exit 1
fi

# Criar diretórios necessários
mkdir -p logs tests data

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

echo ""
echo "🎉 DataHawk iniciado com sucesso!"
echo "📊 Status dos serviços:"
echo "   LLM: http://localhost:8000/health"
echo "   OCR: http://localhost:5000/health"
echo ""
echo "💡 Para executar validação:"
echo "   node dist/main.js validate --input data/sample.csv --config config/complete-validation.yaml"
EOF

    chmod +x "start-datahawk.sh"
    echo -e "${GREEN}✅ Script start-datahawk.sh criado${NC}"
}

# Função principal
main() {
    echo -e "\n${BLUE}🔄 Iniciando atualização das configurações...${NC}"

    # Verificar se estamos no diretório correto
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Execute este script no diretório raiz do projeto DataHawk${NC}"
        exit 1
    fi

    # Executar atualizações
    update_typescript_configs
    update_yaml_configs
    create_production_config
    update_readme
    create_start_script

    echo -e "\n${GREEN}✅ Configurações atualizadas com sucesso!${NC}"
    echo -e "\n${BLUE}📋 Próximos passos:${NC}"
    echo "1. Recompilar o projeto: npm run build"
    echo "2. Baixar modelos: ./scripts/download-recommended-models.sh"
    echo "3. Iniciar serviços: ./start-datahawk.sh"
    echo "4. Testar sistema: node dist/main.js validate --input data/sample.csv --config config/complete-validation.yaml"

    echo -e "\n${YELLOW}💾 Backups criados:${NC}"
    find . -name "*.backup.*" -type f 2>/dev/null | head -10
}

# Executar função principal
main "$@"
