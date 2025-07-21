#!/usr/bin/env python3
"""
DataHawk LLM Server - Ponto de entrada principal
Servidor Python que expõe o modelo Llama-3 8B via HTTP para o Node.js
"""

import sys
from pathlib import Path

# Adicionar o diretório src ao path para imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from llm_server import LlamaServer, ServerHealth, create_app, setup_signal_handlers
from llm_server.logs.logger import get_logger, get_metrics_logger


def main():
    """Função principal do servidor."""
    logger = get_logger('llm_server.main')
    metrics_logger = get_metrics_logger()

    # Configurar signal handlers
    setup_signal_handlers()

    logger.info("🚀 Iniciando DataHawk LLM Server...")
    print("🚀 Starting DataHawk LLM Server...")
    print("📡 Endpoints:")
    print("   GET  /health - Health check")
    print("   POST /load   - Load model")
    print("   POST /generate - Generate response")
    print("   POST /completion - Llama.cpp compatible")
    print("   POST /validate - Validation-specific")
    print()
    print("📝 Logs salvos em:")
    print("   logs/llm-server.log - Log geral")
    print("   logs/llm-server-errors.log - Apenas erros")
    print("   logs/llm-server-metrics.log - Métricas de performance")
    print()

    # Criar instâncias principais
    server = LlamaServer()
    health_monitor = ServerHealth()

    # Log de inicialização
    metrics_logger.info("SERVER_START: Servidor LLM iniciado")

    try:
        # Auto-load model if it exists
        model_path = './models/llama3-8b-instruct.Q4_K_M.gguf'
        if Path(model_path).exists():
            logger.info("🔄 Carregamento automático do modelo...")
            print("🔄 Auto-loading model...")
            if server.load_model(model_path):
                logger.info("✅ Modelo carregado automaticamente com sucesso")
            else:
                logger.error("❌ Falha no carregamento automático do modelo")
        else:
            logger.warning(f"⚠️ Arquivo do modelo não encontrado: {model_path}")
            print(f"⚠️ Model file not found: {model_path}")
            print("   O servidor continuará funcionando, mas sem modelo carregado.")
            print("   Use o endpoint /load para carregar um modelo.")

        # Criar aplicação Flask
        app = create_app(server, health_monitor)

        logger.info("🌐 Servidor HTTP iniciando na porta 8000...")
        app.run(host='127.0.0.1', port=8000, debug=False, threaded=True)

    except Exception as e:
        logger.critical(f"💀 Falha crítica ao iniciar servidor: {e}")
        metrics_logger.error(f"SERVER_STARTUP_FAILED: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
