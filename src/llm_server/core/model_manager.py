"""Gerenciamento do modelo Llama com carregamento e validação."""

import gc
import json
import re
import time
import traceback
from pathlib import Path
from typing import Dict, Any, Optional

from llama_cpp import Llama

from ..logs.logger import get_logger


class LlamaServer:
    """Gerencia o modelo Llama com carregamento, geração e validação."""

    def __init__(self):
        self.llm: Optional[Llama] = None
        self.model_loaded = False
        self.load_time = 0.0
        self.request_count = 0
        self.logger = get_logger('llm_server.model')
        self.metrics_logger = get_logger('llm_metrics')

    def load_model(
        self, model_path: str, retry_count: int = 0, max_retries: int = 3
    ) -> bool:
        """Carrega o modelo Llama com sistema de retry e logs detalhados."""
        if self.model_loaded:
            self.logger.info("🔄 Modelo já carregado, verificando integridade...")
            if self.verify_model_integrity():
                self.logger.info("✅ Modelo carregado e funcionando corretamente")
                return True
            else:
                self.logger.warning(
                    "⚠️ Modelo carregado mas com problemas, recarregando..."
                )
                self.model_loaded = False
                self.llm = None

        if retry_count >= max_retries:
            error_msg = f"❌ Falha ao carregar modelo após {max_retries} tentativas"
            self.logger.critical(error_msg)
            return False

        retry_suffix = (
            f" (tentativa {retry_count + 1}/{max_retries})"
            if retry_count > 0
            else ""
        )
        self.logger.info(f"🔄 Carregando modelo de {model_path}...{retry_suffix}")

        start_time = time.time()

        try:
            # Verificar se o arquivo existe e está acessível
            model_file = Path(model_path)
            if not model_file.exists():
                error_msg = f"❌ Arquivo do modelo não encontrado: {model_path}"
                self.logger.error(error_msg)
                return False

            # Verificar tamanho e integridade do arquivo
            file_size = model_file.stat().st_size / (1024 * 1024 * 1024)  # GB
            self.logger.info(f"📊 Tamanho do modelo: {file_size:.2f} GB")

            if file_size < 0.1:  # Modelo muito pequeno, provavelmente corrompido
                self.logger.warning(
                    f"⚠️ Arquivo do modelo muito pequeno ({file_size:.2f} GB), pode estar corrompido"
                )

            # Verificar memória disponível antes de carregar
            try:
                import psutil

                available_memory_gb = psutil.virtual_memory().available / (1024**3)
                self.logger.info(f"💾 Memória disponível: {available_memory_gb:.2f} GB")

                if available_memory_gb < file_size * 1.5:  # Margem de segurança
                    self.logger.warning(
                        f"⚠️ Pouca memória disponível para carregar modelo de {file_size:.2f} GB"
                    )
            except ImportError:
                self.logger.debug("📝 psutil não disponível, pulando verificação de memória")

            self.logger.debug("🔧 Inicializando Llama com configurações otimizadas...")

            # Configurações adaptativas baseadas no tamanho do modelo
            n_ctx = 8192 if file_size < 7 else 4096  # Contexto menor para modelos grandes
            n_threads = min(4, __import__('os').cpu_count() or 4)  # Usar CPUs disponíveis

            self.logger.debug(f"🔧 Configurações: n_ctx={n_ctx}, n_threads={n_threads}")

            self.llm = Llama(
                model_path=model_path,
                n_ctx=n_ctx,
                n_threads=n_threads,
                n_batch=512,
                verbose=False,
                use_mmap=True,  # Usar memory mapping para eficiência
                use_mlock=False,  # Não trancar toda a memória
                n_gpu_layers=0,  # CPU only por padrão
            )

            self.load_time = time.time() - start_time
            self.model_loaded = True

            # Teste básico do modelo
            if self.verify_model_integrity():
                success_msg = (
                    f"✅ Modelo carregado e verificado com sucesso em {self.load_time:.1f}s"
                )
                self.logger.info(success_msg)

                # Log métricas de carregamento
                self.metrics_logger.info(
                    f"MODELO_CARREGADO: {model_path}, tempo={self.load_time:.1f}s, tentativa={retry_count + 1}"
                )
                return True
            else:
                raise Exception("Modelo carregado mas falhou na verificação de integridade")

        except Exception as e:
            load_time = time.time() - start_time
            error_msg = f"❌ Falha ao carregar modelo (tentativa {retry_count + 1}): {str(e)}"
            self.logger.error(error_msg)
            self.logger.debug(f"🔍 Stack trace completo: {traceback.format_exc()}")

            # Log métricas de erro
            self.metrics_logger.error(
                f"ERRO_CARREGAMENTO: {model_path}, erro={str(e)}, tempo={load_time:.1f}s, tentativa={retry_count + 1}"
            )

            # Limpeza em caso de erro
            self.llm = None
            self.model_loaded = False

            # Tentar novamente após um delay
            if retry_count < max_retries - 1:
                delay = (retry_count + 1) * 2  # Delay progressivo: 2s, 4s, 6s
                self.logger.info(f"⏱️ Aguardando {delay}s antes de tentar novamente...")
                time.sleep(delay)
                return self.load_model(model_path, retry_count + 1, max_retries)

            return False

    def verify_model_integrity(self) -> bool:
        """Verifica se o modelo está funcionando corretamente."""
        if not self.model_loaded or not self.llm:
            return False

        try:
            self.logger.debug("🔍 Verificando integridade do modelo...")
            # Teste simples de geração
            test_result = self.llm("Teste", max_tokens=1, temperature=0.1, echo=False)

            if (
                test_result
                and "choices" in test_result
                and len(test_result["choices"]) > 0
            ):
                self.logger.debug("✅ Verificação de integridade do modelo bem-sucedida")
                return True
            else:
                self.logger.warning(
                    "⚠️ Verificação de integridade falhou - resposta inválida"
                )
                return False

        except Exception as e:
            self.logger.warning(f"⚠️ Verificação de integridade falhou: {e}")
            return False

    def generate(
        self,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.1,
    ) -> Dict[str, Any]:
        """Gera resposta do modelo com monitoramento robusto e recuperação automática."""
        request_id = self.request_count + 1
        start_time = time.time()

        # Verificar se modelo está carregado
        if not self.model_loaded or not self.llm:
            error_msg = "❌ Modelo não carregado ou indisponível"
            self.logger.error(error_msg)
            raise RuntimeError(error_msg)

        # Validar parâmetros de entrada
        if not prompt or not prompt.strip():
            error_msg = "❌ Prompt vazio ou inválido"
            self.logger.error(error_msg)
            raise ValueError(error_msg)

        if max_tokens <= 0 or max_tokens > 4096:
            self.logger.warning(
                f"⚠️ max_tokens ajustado de {max_tokens} para valor válido"
            )
            max_tokens = min(max(max_tokens, 1), 4096)

        self.request_count += 1

        # Log detalhado da requisição
        self.logger.info(f"🤖 Gerando resposta (requisição #{request_id})")
        self.logger.debug(
            f"📝 Parâmetros: prompt_length={len(prompt)}, max_tokens={max_tokens}, temperature={temperature}"
        )

        # Log de métricas de entrada
        self.metrics_logger.info(
            f"REQUEST_START: id={request_id}, prompt_len={len(prompt)}, max_tokens={max_tokens}, temp={temperature}"
        )

        try:
            # Verificar integridade do modelo antes da geração
            if not self.verify_model_integrity():
                error_msg = "❌ Modelo falhou na verificação de integridade"
                self.logger.error(error_msg)
                raise RuntimeError(error_msg)

            self.logger.debug("📤 Enviando prompt para o modelo...")

            # Configurar stops adaptativos baseados no tipo de prompt
            stop_sequences = ["\n\n", "}", "END"]
            if "json" in prompt.lower():
                stop_sequences = ["\n\n", "END"]  # Permitir } em JSON

            # Timeout adaptativo baseado no número de tokens
            timeout_seconds = max(30, max_tokens * 0.1)  # Mínimo 30s, 0.1s por token

            response = self.llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=stop_sequences,
                echo=False,
            )

            processing_time = time.time() - start_time

            # Validar resposta
            if not response or "choices" not in response or not response["choices"]:
                raise ValueError("Resposta do modelo vazia ou inválida")

            result_text = response["choices"][0]["text"].strip()
            tokens_generated = response.get("usage", {}).get("completion_tokens", 0)

            # Log de sucesso
            self.logger.info("✅ Resposta gerada com sucesso")
            self.logger.debug(
                f"📊 Métricas: tempo={processing_time:.2f}s, tokens={tokens_generated}, tamanho={len(result_text)}"
            )

            # Log de métricas de sucesso
            self.metrics_logger.info(
                f"REQUEST_SUCCESS: id={request_id}, time={processing_time:.2f}s, tokens={tokens_generated}, response_len={len(result_text)}"
            )

            return {
                "text": result_text,
                "tokens": tokens_generated,
                "processing_time": processing_time,
                "model": "llama3-8b-instruct",
                "request_id": request_id,
            }

        except Exception as e:
            processing_time = time.time() - start_time
            error_type = type(e).__name__
            error_msg = f"❌ Falha na geração (req #{request_id}): {str(e)}"

            self.logger.error(error_msg)
            self.logger.debug(f"🔍 Erro detalhado: {traceback.format_exc()}")

            # Log de métricas de erro
            self.metrics_logger.error(
                f"REQUEST_ERROR: id={request_id}, time={processing_time:.2f}s, error_type={error_type}, error={str(e)}"
            )

            # Verificar se precisa tentar recuperação
            if "out of memory" in str(e).lower() or "allocation" in str(e).lower():
                self.logger.warning("🧹 Erro de memória detectado, executando limpeza...")
                gc.collect()

            raise RuntimeError(f"Falha na geração de resposta: {str(e)}")

    def extract_json_from_text(self, text: str) -> Optional[Dict[str, Any]]:
        """Extract JSON from text response."""
        # Look for JSON pattern
        json_pattern = r"\{[^}]+\}"
        matches = re.findall(json_pattern, text)

        if matches:
            try:
                # Try to parse the first JSON object found
                return json.loads(matches[0])
            except json.JSONDecodeError:
                pass

        return None
