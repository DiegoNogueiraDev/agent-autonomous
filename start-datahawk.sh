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
