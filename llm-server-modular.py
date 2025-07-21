#!/usr/bin/env python3
"""
DataHawk LLM Server - Versão Modular
Script de entrada compatível com a versão original
"""

import sys
from pathlib import Path

# Adicionar o diretório src ao path para imports
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from llm_server.main import main

if __name__ == '__main__':
    main()
