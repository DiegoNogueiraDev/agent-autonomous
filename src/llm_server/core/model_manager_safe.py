"""Gerenciamento seguro do modelo Llama com proteção contra segmentation fault."""

import gc
import json
import os
import re
import signal
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Dict, Any, Optional

# Import com tratamento de erro
try:
    from llama_cpp import Llama
except ImportError as e:
    print(f"❌ Erro ao importar llama_cpp: {e}")
    sys.exit(1)

from ..logs.logger import get_logger


class SafeLlamaServer:
    """Gerencia o modelo Llama com proteção contra segmentation fault e memory leaks."""

    def __init__(self):
        self.llm: Optional[Llama] = None
        self.model_loaded = False
        self.load_time = 0.0
        self.request_count = 0
        self.logger = get_logger('llm_server.model_safe')
        self.metrics_logger = get_logger('llm_metrics')
        self._lock = threading.Lock()
        self._shutdown_flag = threading.Event()

        # Configurações de segurança
        self.max_memory_usage_gb = 6.0  # Limite de memória
        self.max_context_size = 4096    # Reduzido para estabilidade
        self.max_batch_size = 256       # Reduzido para memória
        self.timeout_seconds = 30       # Timeout para operações

    def _check_memory_usage(self) -> bool:
        """Verifica uso de memória antes de carregar o modelo."""
        try:
            import psutil
            memory = psutil.virtual_memory()
            available_gb = memory.available / (1024**3)

            if available_gb < self.max_memory_usage_gb:
                self.logger.warning(
                    f"⚠️ Memória insuficiente: {available_gb:.2f}GB disponível, "
                    f"precisa de {self.max_memory_usage_gb}GB"
                )
                return False

            self.logger.info(f"💾 Memória disponível: {available_gb:.2f}GB")
            return True

        except ImportError:
            self.logger.debug("📊 psutil não disponível, pulando verificação de memória")
            return True

    def _check_model_integrity(self, model_path: str) -> bool:
        """Verifica integridade do arquivo do modelo."""
        try:
            model_file = Path(model_path)
            if not model_file.exists():
                self.logger.error(f"❌ Arquivo não encontrado: {model_path}")
                return False

            file_size = model_file.stat().st_size
            min_size = 100 * 1024 * 1024  # 100MB mínimo

            if file_size < min_size:
                self.logger.error(
                    f"❌ Arquivo muito pequeno: {file_size} bytes, esperado > {min_size} bytes"
                )
                return False

            # Verifica se é um arquivo GGUF válido
            with open(model_path, 'rb') as f:
                header = f.read(8)
                if not header.startswith(b'GGUF'):
                    self.logger.error("❌ Arquivo não é um modelo GGUF válido")
                    return False

            self.logger.info(f"✅ Integridade do modelo verificada: {file_size / (1024**3):.2f}GB")
            return True

        except Exception as e:
            self.logger.error(f"❌ Erro ao verificar integridade: {e}")
            return False

    def load_model(self, model_path: str, retry_count: int = 0, max_retries: int = 2) -> bool:
        """Carrega o modelo com proteção contra segmentation fault."""
        with self._lock:
            if self._shutdown_flag.is_set():
                return False

            if self.model_loaded:
                self.logger.info("🔄 Modelo já carregado")
                return True

            if retry_count >= max_retries:
                self.logger.error(f"❌ Máximo de tentativas atingido: {max_retries}")
                return False

            # Verificações de segurança
            if not self._check_model_integrity(model_path):
                return False

            if not self._check_memory_usage():
                return False

            self.logger.info(
                f"🔄 Carregando modelo (tentativa {retry_count + 1}/{max_retries})"
            )

            start_time = time.time()

            try:
                # Configurações conservadoras para estabilidade
                n_threads = min(2, os.cpu_count() or 2)  # Reduzido
                n_ctx = self.max_context_size
                n_batch = self.max_batch_size

                self.logger.info(
                    f"🔧 Configurações: n_ctx={n_ctx}, n_threads={n_threads}, n_batch={n_batch}"
                )

                # Carregamento com timeout
                def load_with_timeout():
                    try:
                        self.llm = Llama(
                            model_path=model_path,
                            n_ctx=n_ctx,
                            n_threads=n_threads,
                            n_batch=n_batch,
                            verbose=False,
                            use_mmap=True,
                            use_mlock=False,
                            n_gpu_layers=0,
                        )
                        return True
                    except Exception as e:
                        self.logger.error(f"❌ Erro no carregamento: {e}")
                        return False

                # Timeout para carregamento
                load_thread = threading.Thread(target=load_with_timeout)
                load_thread.daemon = True
                load_thread.start()
                load_thread.join(timeout=60)  # 60 segundos máximo

                if not load_thread.is_alive() and self.llm is not None:
                    self.load_time = time.time() - start_time
                    self.model_loaded = True

                    # Teste rápido de integridade
                    if self.verify_model_integrity():
                        self.logger.info(
                            f"✅ Modelo carregado com sucesso em {self.load_time:.1f}s"
                        )
                        self.metrics_logger.info(
                            f"MODELO_CARREGADO: {model_path}, tempo={self.load_time:.1f}s"
                        )
                        return True
                    else:
                        self.logger.error("❌ Falha na verificação de integridade")
                        self.unload_model()

                else:
                    self.logger.error("❌ Timeout no carregamento do modelo")
                    self.unload_model()

            except Exception as e:
                self.logger.error(f"❌ Erro crítico no carregamento: {e}")
                self.logger.debug(traceback.format_exc())
                self.unload_model()

                # Delay progressivo
                if retry_count < max_retries - 1:
                    delay = (retry_count + 1) * 5
                    self.logger.info(f"⏱️ Aguardando {delay}s antes de tentar...")
                    time.sleep(delay)
                    return self.load_model(model_path, retry_count + 1, max_retries)

            return False

    def unload_model(self):
        """Descarrega o modelo e limpa memória."""
        with self._lock:
            if self.llm is not None:
                try:
                    # Força garbage collection
                    del self.llm
                    self.llm = None
                    self.model_loaded = False

                    gc.collect()

                    self.logger.info("🧹 Modelo descarregado e memória limpa")

                except Exception as e:
                    self.logger.error(f"❌ Erro ao descarregar modelo: {e}")

    def verify_model_integrity(self) -> bool:
        """Verifica se o modelo está funcionando corretamente."""
        if not self.model_loaded or self.llm is None:
            return False

        try:
            # Teste muito simples e rápido
            response = self.llm("Hi", max_tokens=1, temperature=0.1)
            return (
                response is not None
                and "choices" in response
                and len(response["choices"]) > 0
            )

        except Exception as e:
            self.logger.warning(f"⚠️ Falha na verificação: {e}")
            return False

    def generate(self, prompt: str, max_tokens: int = 512, temperature: float = 0.1) -> Dict[str, Any]:
        """Gera resposta com proteção contra falhas."""
        with self._lock:
            if self._shutdown_flag.is_set():
                raise RuntimeError("Servidor em shutdown")

            if not self.model_loaded or self.llm is None:
                raise RuntimeError("Modelo não carregado")

            if not prompt or not prompt.strip():
                raise ValueError("Prompt inválido")

            # Limita parâmetros para segurança
            max_tokens = min(max(max_tokens, 1), 1024)  # Limite conservador
            temperature = max(0.0, min(temperature, 1.0))

            self.request_count += 1
            start_time = time.time()

            try:
                # Verifica integridade antes
                if not self.verify_model_integrity():
                    raise RuntimeError("Modelo falhou na verificação")

                # Configurações seguras
                response = self.llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stop=["\n\n", "}"],
                    echo=False,
                )

                if not response or "choices" not in response:
                    raise ValueError("Resposta inválida do modelo")

                result_text = response["choices"][0]["text"].strip()
                tokens = response.get("usage", {}).get("completion_tokens", 0)
                processing_time = time.time() - start_time

                return {
                    "text": result_text,
                    "tokens": tokens,
                    "processing_time": processing_time,
                    "model": "llama3-8b-instruct-safe",
                    "request_id": self.request_count,
                }

            except Exception as e:
                processing_time = time.time() - start_time
                error_msg = f"Erro na geração: {str(e)}"

                self.logger.error(error_msg)
                self.metrics_logger.error(
                    f"REQUEST_ERROR: id={self.request_count}, time={processing_time:.2f}s, error={str(e)}"
                )

                # Tenta recuperar em caso de erro de memória
                if "memory" in str(e).lower() or "allocation" in str(e).lower():
                    self.logger.warning("🧹 Erro de memória, limpando...")
                    gc.collect()

                raise RuntimeError(error_msg)

    def shutdown(self):
        """Inicia shutdown seguro do servidor."""
        self.logger.info("🛑 Iniciando shutdown seguro...")
        self._shutdown_flag.set()
        self.unload_model()

    def get_status(self) -> Dict[str, Any]:
        """Retorna status do servidor."""
        return {
            "model_loaded": self.model_loaded,
            "request_count": self.request_count,
            "load_time": self.load_time,
            "max_context_size": self.max_context_size,
            "max_batch_size": self.max_batch_size,
        }
