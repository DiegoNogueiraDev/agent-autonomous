"""DataHawk LLM Server - Servidor Python para gerenciamento de modelos LLM."""

__version__ = "1.0.0"
__author__ = "DataHawk Team"
__description__ = "Servidor Python que expõe modelos LLM via HTTP"

from .core import LlamaServer, ServerHealth
from .logs import get_logger, get_metrics_logger
from .api import create_app
from .utils import setup_signal_handlers

__all__ = [
    "LlamaServer",
    "ServerHealth",
    "get_logger",
    "get_metrics_logger",
    "create_app",
    "setup_signal_handlers",
]
