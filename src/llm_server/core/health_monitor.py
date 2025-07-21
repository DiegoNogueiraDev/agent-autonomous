"""Monitoramento de saúde do servidor com recuperação automática."""

import gc
import threading
import time
from typing import Dict, List, Any

from ..logs.logger import get_logger


class ServerHealth:
    """Monitora a saúde do servidor e implementa recuperação automática."""

    def __init__(self):
        self.start_time = time.time()
        self.last_heartbeat = time.time()
        self.consecutive_errors = 0
        self.max_consecutive_errors = 5
        self.recovery_attempts = 0
        self.max_recovery_attempts = 3
        self.error_threshold_rate = 0.1  # 10% de taxa de erro
        self.recent_requests: List[Dict[str, Any]] = []
        self.recent_errors: List[Dict[str, Any]] = []
        self.monitoring_active = True
        self.lock = threading.Lock()
        self.logger = get_logger('llm_server.health')
        self.metrics_logger = get_logger('llm_metrics')

    def record_request(self, success: bool = True, error_msg: str = None):
        """Registra uma requisição para monitoramento."""
        with self.lock:
            current_time = time.time()

            # Manter apenas últimos 100 requests
            self.recent_requests.append(
                {"timestamp": current_time, "success": success}
            )
            if len(self.recent_requests) > 100:
                self.recent_requests.pop(0)

            # Registrar erros
            if not success:
                self.consecutive_errors += 1
                self.recent_errors.append(
                    {"timestamp": current_time, "error": error_msg}
                )
                if len(self.recent_errors) > 50:
                    self.recent_errors.pop(0)

                self.logger.warning(
                    f"⚠️ Erro registrado (#{self.consecutive_errors} consecutivos): {error_msg}"
                )

                # Verificar se precisa de recuperação
                if self.consecutive_errors >= self.max_consecutive_errors:
                    self.logger.error(
                        f"🚨 Muitos erros consecutivos ({self.consecutive_errors}), iniciando recuperação automática"
                    )
                    self.trigger_recovery()
            else:
                self.consecutive_errors = 0

            self.last_heartbeat = current_time

    def trigger_recovery(self) -> bool:
        """Inicia processo de recuperação automática."""
        if self.recovery_attempts >= self.max_recovery_attempts:
            self.logger.critical(
                "💀 Máximo de tentativas de recuperação atingido, servidor pode estar instável"
            )
            return False

        self.recovery_attempts += 1
        self.logger.info(
            f"🔄 Iniciando recuperação automática (tentativa {self.recovery_attempts}/{self.max_recovery_attempts})"
        )

        try:
            # Força garbage collection
            self.logger.info("🧹 Executando limpeza de memória...")
            gc.collect()

            # Reset contadores
            self.consecutive_errors = 0

            self.logger.info("✅ Recuperação automática concluída")
            return True

        except Exception as e:
            self.logger.error(f"❌ Falha na recuperação automática: {e}")
            return False

    def get_health_status(self) -> Dict[str, Any]:
        """Retorna status de saúde detalhado."""
        with self.lock:
            current_time = time.time()
            uptime = current_time - self.start_time

            # Calcular taxa de erro recente (últimos 5 minutos)
            recent_cutoff = current_time - 300  # 5 minutos
            recent_reqs = [
                r for r in self.recent_requests if r["timestamp"] > recent_cutoff
            ]

            if recent_reqs:
                error_rate = len([r for r in recent_reqs if not r["success"]]) / len(
                    recent_reqs
                )
            else:
                error_rate = 0.0

            status = "healthy"
            if self.consecutive_errors >= 3:
                status = "degraded"
            elif error_rate > self.error_threshold_rate:
                status = "warning"
            elif self.recovery_attempts > 0:
                status = "recovering"

            return {
                "status": status,
                "uptime_seconds": uptime,
                "consecutive_errors": self.consecutive_errors,
                "error_rate_5min": error_rate,
                "recovery_attempts": self.recovery_attempts,
                "total_requests": len(self.recent_requests),
                "recent_errors": len(self.recent_errors),
                "last_heartbeat": self.last_heartbeat,
            }
