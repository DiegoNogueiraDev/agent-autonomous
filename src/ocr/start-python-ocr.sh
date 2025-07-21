#!/bin/bash

# Script para iniciar o serviço Python OCR
# Este script configura e inicia o serviço OCR Python

set -e

echo "🦅 DataHawks - Python OCR Service"
echo "================================="

# Detectar sistema operacional
OS="$(uname -s)"
case "$OS" in
    Linux*)     PLATFORM=Linux;;
    Darwin*)    PLATFORM=Mac;;
    CYGWIN*)    PLATFORM=Cygwin;;
    MINGW*)     PLATFORM=Windows;;
    *)          PLATFORM="UNKNOWN:$OS"
esac

echo "Plataforma detectada: $PLATFORM"

# Verificar se Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não está instalado"
    echo "Por favor, instale Python 3.8 ou superior"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python versão: $PYTHON_VERSION"

# Verificar se pip está instalado
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 não está instalado"
    echo "Por favor, instale pip3"
    exit 1
fi

# Verificar se Tesseract está instalado
if ! command -v tesseract &> /dev/null; then
    echo "❌ Tesseract OCR não está instalado"
    echo ""
    echo "Para instalar Tesseract:"
    echo ""
    case "$PLATFORM" in
        Linux)
            echo "Ubuntu/Debian: sudo apt-get install tesseract-ocr tesseract-ocr-por tesseract-ocr-eng"
            echo "CentOS/RHEL: sudo yum install tesseract tesseract-langpack-por tesseract-langpack-eng"
            echo "Arch: sudo pacman -S tesseract tesseract-data-por tesseract-data-eng"
            ;;
        Mac)
            echo "brew install tesseract tesseract-lang"
            ;;
        Windows)
            echo "1. Baixe e instale o Tesseract OCR de: https://github.com/UB-Mannheim/tesseract/wiki"
            echo "2. Adicione o Tesseract ao PATH do sistema"
            ;;
    esac
    exit 1
fi

TESSERACT_VERSION=$(tesseract --version 2>&1 | head -n1 | awk '{print $2}')
echo "Tesseract versão: $TESSERACT_VERSION"

# Verificar idiomas disponíveis
echo "Verificando idiomas disponíveis..."
AVAILABLE_LANGUAGES=$(tesseract --list-langs 2>/dev/null | grep -v "List of available languages" | tr '\n' ' ')
echo "Idiomas disponíveis: $AVAILABLE_LANGUAGES"

# Verificar se português e inglês estão disponíveis
if ! echo "$AVAILABLE_LANGUAGES" | grep -q "por"; then
    echo "⚠️  Idioma português (por) não encontrado"
    echo "Instale o pacote de idioma português"
fi

if ! echo "$AVAILABLE_LANGUAGES" | grep -q "eng"; then
    echo "⚠️  Idioma inglês (eng) não encontrado"
    echo "Instale o pacote de idioma inglês"
fi

# Instalar dependências Python
echo "Instalando dependências Python..."
cd "$(dirname "$0")"
pip3 install -r requirements.txt

# Verificar se as dependências foram instaladas
python3 -c "
import sys
try:
    import cv2
    import numpy as np
    from PIL import Image
    import pytesseract
    from flask import Flask
    print('✅ Todas as dependências foram instaladas com sucesso')
except ImportError as e:
    print(f'❌ Erro ao importar dependência: {e}')
    sys.exit(1)
"

# Iniciar o serviço
echo ""
echo "🚀 Iniciando Python OCR Service..."
echo "Serviço será iniciado em: http://localhost:5000"
echo "Pressione Ctrl+C para parar"
echo ""

# Executar o serviço
python3 python-ocr-service.py --host 0.0.0.0 --port 5000
