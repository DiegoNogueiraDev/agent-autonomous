"""Handlers para sinais de sistema."""

import signal
import sys
import threading
from typing import Any

from ..logs.logger import get_logger, get_metrics_logger


# Sistema de shutdown gracioso
shutdown_flag = threading.Event()


def signal_handler(signum: int, frame: Any) -> None:
    """Handler para sinais de sistema para shutdown gracioso."""
    signal_name = signal.Signals(signum).name
    logger = get_logger('llm_server.signals')
    metrics_logger = get_metrics_logger()

    logger.info(f"🛑 Sinal {signal_name} recebido, iniciando shutdown gracioso...")

    # Marcar flag de shutdown
    shutdown_flag.set()

    # Log final de métricas
    from ..core import ServerHealth
    # Import dinâmico para evitar circular imports
    health_monitor = ServerHealth()
    health_status = health_monitor.get_health_status()
    metrics_logger.info(
        f"SHUTDOWN: uptime={health_status['uptime_seconds']:.0f}s, "
        f"total_requests={health_status['total_requests']}, "
        f"errors={health_status['recent_errors']}"
    )

    logger.info("✅ Servidor LLM finalizado graciosamente")
    sys.exit(0)


def setup_signal_handlers() -> None:
    """Configura handlers para sinais de sistema."""
    signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # Terminate
    if hasattr(signal, 'SIGHUP'):
        signal.signal(signal.SIGHUP, signal_handler)   # Hangup (Unix only)
