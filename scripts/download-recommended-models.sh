#!/bin/bash

# DataHawk - Script para Download de Modelos LLM Recomendados
# Baixa modelos otimizados para baixo consumo de RAM

set -e

MODELS_DIR="models"
TEMP_DIR="/tmp/datahawk-models"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 DataHawk - Download de Modelos LLM Recomendados${NC}"
echo "=================================================="

# Criar diretórios
mkdir -p "$MODELS_DIR"
mkdir -p "$TEMP_DIR"

# Função para verificar espaço em disco
check_disk_space() {
    local required_gb=$1
    local available_gb=$(df . | tail -1 | awk '{print int($4/1024/1024)}')

    if [ "$available_gb" -lt "$required_gb" ]; then
        echo -e "${RED}❌ Espaço insuficiente: ${available_gb}GB disponível, ${required_gb}GB necessário${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ Espaço suficiente: ${available_gb}GB disponível${NC}"
    return 0
}

# Função para baixar modelo
download_model() {
    local name=$1
    local url=$2
    local filename=$3
    local size=$4

    echo -e "\n${YELLOW}📦 Baixando: ${name} (${size})${NC}"
    echo "URL: $url"

    if [ -f "$MODELS_DIR/$filename" ]; then
        echo -e "${GREEN}✅ Modelo já existe: $filename${NC}"
        return 0
    fi

    # Baixar para diretório temporário primeiro
    echo "Baixando para $TEMP_DIR/$filename..."
    if wget -q --show-progress --timeout=30 --tries=3 "$url" -O "$TEMP_DIR/$filename"; then
        # Verificar se o arquivo foi baixado corretamente
        if [ -s "$TEMP_DIR/$filename" ]; then
            # Mover para diretório final apenas se download completo
            mv "$TEMP_DIR/$filename" "$MODELS_DIR/$filename"
            echo -e "${GREEN}✅ Download concluído: $filename${NC}"
            return 0
        else
            echo -e "${RED}❌ Arquivo baixado está vazio: $filename${NC}"
            rm -f "$TEMP_DIR/$filename"
            return 1
        fi
    else
        echo -e "${RED}❌ Falha no download: $filename${NC}"
        rm -f "$TEMP_DIR/$filename"
        return 1
    fi
}

# Verificar se wget está instalado
if ! command -v wget &> /dev/null; then
    echo -e "${RED}❌ wget não encontrado. Instale com: sudo apt install wget${NC}"
    exit 1
fi

echo -e "\n${BLUE}💾 Verificando espaço em disco...${NC}"
if ! check_disk_space 10; then
    echo -e "${RED}❌ Pelo menos 10GB de espaço livre são necessários${NC}"
    exit 1
fi

echo -e "\n${BLUE}📋 Modelos disponíveis:${NC}"
echo "1. TinyLlama 1.1B Chat (~0.8GB) - Ultra rápido"
echo "2. Qwen 1.5 1.8B Chat (~1.2GB) - Bom raciocínio"
echo "3. Gemma 2B IT (~1.5GB) - Equilibrado, bom PT-BR"
echo "4. Phi-3 Mini 4K (~2.7GB) - Qualidade superior"
echo "5. Todos os modelos acima"

echo -e "\n${YELLOW}Escolha uma opção (1-5):${NC}"
read -r choice

case $choice in
    1)
        echo -e "\n${BLUE}Baixando TinyLlama 1.1B Chat...${NC}"
        download_model \
            "TinyLlama 1.1B Chat" \
            "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
            "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
            "0.8GB"
        ;;
    2)
        echo -e "\n${BLUE}Baixando Qwen 1.5 1.8B Chat...${NC}"
        download_model \
            "Qwen 1.5 1.8B Chat" \
            "https://huggingface.co/Qwen/Qwen1.5-1.8B-Chat-GGUF/resolve/main/qwen1_5-1_8b-chat-q4_k_m.gguf" \
            "qwen1.5-1.8b-chat.Q4_K_M.gguf" \
            "1.2GB"
        ;;
    3)
        echo -e "\n${BLUE}Baixando Gemma 2B IT...${NC}"
        download_model \
            "Gemma 2B IT" \
            "https://huggingface.co/lmstudio-ai/gemma-2b-it-GGUF/resolve/main/gemma-2b-it-q4_k_m.gguf" \
            "gemma-2b-it.Q4_K_M.gguf" \
            "1.5GB"
        ;;
    4)
        echo -e "\n${BLUE}Baixando Phi-3 Mini 4K...${NC}"
        download_model \
            "Phi-3 Mini 4K" \
            "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf" \
            "phi-3-mini-4k-instruct.Q4_K_M.gguf" \
            "2.7GB"
        ;;
    5)
        echo -e "\n${BLUE}Baixando todos os modelos...${NC}"

        download_model \
            "TinyLlama 1.1B Chat" \
            "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
            "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
            "0.8GB"

        download_model \
            "Qwen 1.5 1.8B Chat" \
            "https://huggingface.co/Qwen/Qwen1.5-1.8B-Chat-GGUF/resolve/main/qwen1_5-1_8b-chat-q4_k_m.gguf" \
            "qwen1.5-1.8b-chat.Q4_K_M.gguf" \
            "1.2GB"

        download_model \
            "Gemma 2B IT" \
            "https://huggingface.co/lmstudio-ai/gemma-2b-it-GGUF/resolve/main/gemma-2b-it-q4_k_m.gguf" \
            "gemma-2b-it.Q4_K_M.gguf" \
            "1.5GB"

        download_model \
            "Phi-3 Mini 4K" \
            "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf" \
            "phi-3-mini-4k-instruct.Q4_K_M.gguf" \
            "2.7GB"
        ;;
    *)
        echo -e "${RED}❌ Opção inválida${NC}"
        exit 1
        ;;
esac

# Limpeza
rm -rf "$TEMP_DIR"

echo -e "\n${GREEN}✅ Download(s) concluído(s)!${NC}"
echo -e "\n${BLUE}📂 Modelos disponíveis em $MODELS_DIR/:${NC}"
ls -lah "$MODELS_DIR"/*.gguf 2>/dev/null || echo "Nenhum modelo encontrado"

echo -e "\n${BLUE}🚀 Para usar o servidor LLM:${NC}"
echo "python3 llm-server-production.py"

echo -e "\n${BLUE}💡 Dicas:${NC}"
echo "• TinyLlama: Ideal para RAM <= 4GB"
echo "• Qwen 1.8B: Bom para cálculos simples"
echo "• Gemma 2B: Melhor para português"
echo "• Phi-3 Mini: Qualidade superior geral"
