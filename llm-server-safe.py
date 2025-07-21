#!/usr/bin/env python3
"""
DataHawk LLM Server - Versão Segura com Proteção contra Segmentation Fault
"""

import sys
import os
from pathlib import Path

# Adicionar o diretório src ao path para imports
sys.path.insert(0, str(Path(__file__).parent / 'src'))

# Import seguro
try:
    from llm_server.core.model_manager_safe import SafeLlamaServer
    from llm_server.core.health_monitor import ServerHealth
    from llm_server.api.routes import create_app_safe
    from llm_server.logs.logger import get_logger, get_metrics_logger
    from llm_server.utils.signals import setup_signal_handlers
except ImportError as e:
    print(f"❌ Erro ao importar módulos: {e}")
    sys.exit(1)


def main():
    """Função principal do servidor seguro."""
    logger = get_logger('llm_server.main_safe')
    metrics_logger = get_metrics_logger()

    # Configurar signal handlers
    setup_signal_handlers()

    logger.info("🚀 Iniciando DataHawk LLM Server - Versão Segura...")
    print("🚀 Starting DataHawk LLM Server - Safe Mode")
    print("📡 Endpoints:")
    print("   GET  /health - Health check")
    print("   POST /load   - Load model")
    print("   POST /generate - Generate response")
    print("   POST /completion - Llama.cpp compatible")
    print("   POST /validate - Validation-specific")
    print()
    print("🛡️  Features de segurança:")
    print("   - Proteção contra segmentation fault")
    print("   - Verificação de memória")
    print("   - Timeout de operações")
    print("   - Garbage collection automático")
    print()
    print("📝 Logs salvos em:")
    print("   logs/llm-server.log - Log geral")
    print("   logs/llm-server-errors.log - Apenas erros")
    print("   logs/llm-server-metrics.log - Métricas de performance")
    print()

    # Criar instâncias principais
    server = SafeLlamaServer()
    health_monitor = ServerHealth()

    # Log de inicialização
    metrics_logger.info("SERVER_START: Servidor LLM seguro iniciado")

    try:
        # Verificar se o modelo existe
        model_path = './models/llama3-8b-instruct.Q4_K_M.gguf'
        if Path(model_path).exists():
            logger.info("🔄 Carregamento automático do modelo...")
            print("🔄 Auto-loading model...")

            # Tentar carregar com verificações de segurança
            if server.load_model(model_path):
                logger.info("✅ Modelo carregado automaticamente com sucesso")
                print("✅ Model loaded successfully")
            else:
                logger.error("❌ Falha no carregamento automático do modelo")
                print("❌ Failed to load model automatically")
                print("   O servidor continuará sem modelo carregado.")
                print("   Use o endpoint /load para carregar manualmente.")
        else:
            logger.warning(f"⚠️ Arquivo do modelo não encontrado: {model_path}")
            print(f"⚠️ Model file not found: {model_path}")
            print("   O servidor continuará funcionando, mas sem modelo carregado.")
            print("   Use o endpoint /load para carregar um modelo.")

        # Criar aplicação Flask segura
        app = create_app_safe(server, health_monitor)

        logger.info("🌐 Servidor HTTP iniciando na porta 8000...")
        print("🌐 HTTP server starting on port 8000...")

        # Configurações de segurança para Flask
        app.run(
            host='127.0.0.1',
            port=8000,
            debug=False,
            threaded=True,
            use_reloader=False  # Desabilita auto-reload para estabilidade
        )

    except KeyboardInterrupt:
        logger.info("🛑 Servidor interrompido pelo usuário")
        server.shutdown()

    except Exception as e:
        logger.critical(f"💀 Falha crítica ao iniciar servidor: {e}")
        metrics_logger.error(f"SERVER_STARTUP_FAILED: {str(e)}")
        server.shutdown()
        sys.exit(1)


if __name__ == '__main__':
    main()
