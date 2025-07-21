#!/usr/bin/env python3
"""
DataHawk LLM Server - Versão de Produção
Otimizado para modelos pequenos e estáveis (TinyLlama, Gemma-2B, Qwen-1.8B)
"""

import os
import sys
import gc
import time
import json
import signal
import psutil
import logging
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, Dict, Any
from dataclasses import dataclass

from flask import Flask, request, jsonify
from llama_cpp import Llama

# Configuração de logging otimizada
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(name)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/llm-server-production.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('llm_server_production')

@dataclass
class ModelConfig:
    """Configurações otimizadas para diferentes modelos"""
    name: str
    path: str
    n_ctx: int
    n_threads: int
    n_batch: int
    memory_requirement_gb: float
    description: str

# Modelos recomendados em ordem de preferência (menor para maior)
SUPPORTED_MODELS = [
    ModelConfig(
        name="tinyllama",
        path="models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        n_ctx=2048,
        n_threads=2,
        n_batch=64,
        memory_requirement_gb=1.5,
        description="TinyLlama 1.1B - Ultra rápido, baixo consumo de RAM"
    ),
    ModelConfig(
        name="qwen-1.8b",
        path="models/qwen1.5-1.8b-chat.Q4_K_M.gguf",
        n_ctx=2048,
        n_threads=2,
        n_batch=128,
        memory_requirement_gb=2.0,
        description="Qwen 1.8B - Bom para raciocínio numérico"
    ),
    ModelConfig(
        name="gemma-2b",
        path="models/gemma-2b-it.Q4_K_M.gguf",
        n_ctx=2048,
        n_threads=3,
        n_batch=128,
        memory_requirement_gb=2.5,
        description="Gemma 2B - Equilibrado, bom em PT-BR"
    ),
    ModelConfig(
        name="phi3-mini",  # Fallback para o modelo atual
        path="models/phi-3-mini-4k-instruct.Q4_K_M.gguf",
        n_ctx=2048,
        n_threads=3,
        n_batch=128,
        memory_requirement_gb=3.5,
        description="Phi-3 Mini - Atual, boa qualidade geral"
    )
]

class ProductionLLMServer:
    def __init__(self):
        self.model: Optional[Llama] = None
        self.current_model_config: Optional[ModelConfig] = None
        self.app = Flask(__name__)
        self.setup_routes()
        self.setup_signal_handlers()

    def setup_signal_handlers(self):
        """Configura handlers para shutdown graceful"""
        def signal_handler(signum, frame):
            logger.info(f"📡 Recebido sinal {signum}, realizando shutdown graceful...")
            self.cleanup()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    def get_available_memory_gb(self) -> float:
        """Retorna memória disponível em GB"""
        try:
            memory = psutil.virtual_memory()
            return memory.available / (1024**3)
        except:
            return 0.0

    def select_best_model(self) -> Optional[ModelConfig]:
        """Seleciona o melhor modelo baseado na memória disponível e arquivos existentes"""
        available_memory = self.get_available_memory_gb()
        logger.info(f"💾 Memória disponível: {available_memory:.1f}GB")

        # Filtrar modelos que cabem na memória e existem no disco
        suitable_models = []
        for model in SUPPORTED_MODELS:
            if model.memory_requirement_gb <= available_memory:
                model_path = Path(model.path)
                if model_path.exists():
                    suitable_models.append(model)
                    logger.info(f"✅ Modelo disponível: {model.name} ({model.description})")
                else:
                    logger.info(f"⚠️ Modelo não encontrado: {model.path}")
            else:
                logger.info(f"❌ Modelo requer muita RAM: {model.name} ({model.memory_requirement_gb:.1f}GB)")

        if not suitable_models:
            logger.error("❌ Nenhum modelo adequado encontrado!")
            return None

        # Retorna o mais "potente" que cabe na memória
        best_model = suitable_models[-1]
        logger.info(f"🎯 Modelo selecionado: {best_model.name} - {best_model.description}")
        return best_model

    @contextmanager
    def safe_model_loading(self):
        """Context manager para carregamento seguro do modelo"""
        try:
            logger.info("🔄 Iniciando carregamento seguro do modelo...")
            gc.collect()  # Limpar memória antes
            yield
            logger.info("✅ Modelo carregado com sucesso")
        except Exception as e:
            logger.error(f"❌ Falha no carregamento: {e}")
            if self.model:
                try:
                    del self.model
                except:
                    pass
                self.model = None
            gc.collect()
            raise

    def load_model(self) -> bool:
        """Carrega o melhor modelo disponível"""
        try:
            # Selecionar modelo adequado
            model_config = self.select_best_model()
            if not model_config:
                return False

            self.current_model_config = model_config

            with self.safe_model_loading():
                logger.info(f"📚 Carregando {model_config.name}: {model_config.path}")
                logger.info(f"🔧 Configurações: ctx={model_config.n_ctx}, threads={model_config.n_threads}, batch={model_config.n_batch}")

                # Configurações ultra conservadoras
                self.model = Llama(
                    model_path=model_config.path,
                    n_ctx=model_config.n_ctx,
                    n_threads=model_config.n_threads,
                    n_batch=model_config.n_batch,
                    n_gpu_layers=0,      # CPU only para estabilidade
                    verbose=False,       # Reduzir logging
                    use_mmap=True,       # Memory mapping
                    use_mlock=False,     # Sem memory lock
                    low_vram=True,       # Low VRAM mode
                    f16_kv=False,        # Use f32 para estabilidade
                    logits_all=False,    # Salvar memória
                    vocab_only=False,    # Carregar vocabulário completo
                    embedding=False,     # Sem embeddings
                    n_parts=1,          # Single part
                    seed=42,            # Seed fixo
                    f32_kv=True         # Force f32 para estabilidade
                )

                # Teste básico para verificar se o modelo está funcional
                logger.info("🧪 Testando modelo...")
                test_response = self.model.create_completion(
                    prompt="Teste rápido:",
                    max_tokens=5,
                    temperature=0.1,
                    top_p=0.9,
                    stop=["\n"]
                )

                if test_response and 'choices' in test_response:
                    logger.info(f"✅ Modelo {model_config.name} funcional!")
                    return True
                else:
                    logger.error("❌ Teste do modelo falhou")
                    return False

        except Exception as e:
            logger.error(f"❌ Erro carregando modelo: {e}")
            return False

    def setup_routes(self):
        """Configura rotas da API"""

        @self.app.route('/health', methods=['GET'])
        def health():
            """Health check endpoint"""
            try:
                status = {
                    'status': 'healthy' if self.model else 'model_not_loaded',
                    'model_loaded': bool(self.model),
                    'model_name': self.current_model_config.name if self.current_model_config else None,
                    'model_description': self.current_model_config.description if self.current_model_config else None,
                    'timestamp': time.time(),
                    'memory_usage': f"{psutil.virtual_memory().percent:.1f}%",
                    'available_memory_gb': f"{self.get_available_memory_gb():.1f}GB"
                }
                return jsonify(status), 200 if self.model else 503
            except Exception as e:
                logger.error(f"❌ Health check falhou: {e}")
                return jsonify({'status': 'error', 'error': str(e)}), 500

        @self.app.route('/models', methods=['GET'])
        def list_models():
            """Lista modelos disponíveis"""
            try:
                available_memory = self.get_available_memory_gb()
                models_info = []

                for model in SUPPORTED_MODELS:
                    model_path = Path(model.path)
                    models_info.append({
                        'name': model.name,
                        'description': model.description,
                        'path': model.path,
                        'memory_requirement_gb': model.memory_requirement_gb,
                        'file_exists': model_path.exists(),
                        'can_load': model.memory_requirement_gb <= available_memory and model_path.exists(),
                        'is_current': self.current_model_config and self.current_model_config.name == model.name
                    })

                return jsonify({
                    'available_memory_gb': available_memory,
                    'models': models_info
                }), 200
            except Exception as e:
                logger.error(f"❌ Erro listando modelos: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/validate', methods=['POST'])
        def validate():
            """Endpoint de validação específico para DataHawk"""
            try:
                if not self.model:
                    return jsonify({
                        'error': 'Modelo não carregado',
                        'match': False,
                        'confidence': 0.0
                    }), 503

                data = request.get_json()
                if not data:
                    return jsonify({
                        'error': 'JSON inválido',
                        'match': False,
                        'confidence': 0.0
                    }), 400

                csv_value = str(data.get('csv_value', ''))
                web_value = str(data.get('web_value', ''))
                field_type = data.get('field_type', 'text')

                # Prompt otimizado para modelos pequenos
                if self.current_model_config.name == "tinyllama":
                    # Prompt muito simples para TinyLlama
                    prompt = f"CSV: {csv_value[:50]}\nWEB: {web_value[:50]}\nSame? Yes/No:"
                else:
                    # Prompt mais detalhado para modelos maiores
                    prompt = f"""Compare these values:
CSV: "{csv_value[:100]}"
WEB: "{web_value[:100]}"
Type: {field_type}

Are they the same? Answer only: YES or NO"""

                # Geração com configurações conservadoras
                response = self.model.create_completion(
                    prompt=prompt,
                    max_tokens=3,  # Muito pequeno para modelos menores
                    temperature=0.1,
                    top_p=0.9,
                    stop=["\n", ".", "?", "!", " "],
                    echo=False
                )

                if response and 'choices' in response and len(response['choices']) > 0:
                    answer = response['choices'][0]['text'].strip().upper()
                    match = 'YES' in answer or 'SIM' in answer
                    confidence = 0.9 if match else 0.1

                    return jsonify({
                        'match': match,
                        'confidence': confidence,
                        'reasoning': f"LLM ({self.current_model_config.name}): {answer}",
                        'csv_value': csv_value,
                        'web_value': web_value,
                        'model_used': self.current_model_config.name
                    }), 200
                else:
                    logger.error("❌ Resposta vazia do modelo")
                    return jsonify({
                        'error': 'Resposta vazia do modelo',
                        'match': False,
                        'confidence': 0.0
                    }), 500

            except Exception as e:
                logger.error(f"❌ Erro na validação: {e}")
                return jsonify({
                    'error': f'Erro interno: {str(e)}',
                    'match': False,
                    'confidence': 0.0
                }), 500

    def cleanup(self):
        """Limpeza de recursos"""
        try:
            if self.model:
                logger.info("🧹 Limpando modelo...")
                del self.model
                self.model = None
            gc.collect()
            logger.info("✅ Limpeza concluída")
        except Exception as e:
            logger.error(f"❌ Erro na limpeza: {e}")

    def run(self):
        """Executa o servidor"""
        try:
            logger.info("🚀 Iniciando DataHawk LLM Server - Versão de Produção")
            logger.info("📦 Suporte para modelos: TinyLlama, Qwen-1.8B, Gemma-2B, Phi-3-Mini")

            # Criar diretório de logs se não existir
            os.makedirs('logs', exist_ok=True)

            # Carregar melhor modelo disponível
            if not self.load_model():
                logger.error("❌ Falha ao carregar qualquer modelo. Servidor não iniciará.")
                logger.info("💡 Dica: Baixe um dos modelos recomendados:")
                for model in SUPPORTED_MODELS:
                    logger.info(f"   • {model.name}: {model.description}")
                return False

            logger.info(f"🌐 Iniciando servidor HTTP em 127.0.0.1:8000")
            logger.info(f"🎯 Modelo ativo: {self.current_model_config.name}")

            # Executar servidor Flask
            self.app.run(
                host='127.0.0.1',
                port=8000,
                debug=False,
                threaded=True,
                use_reloader=False
            )

        except KeyboardInterrupt:
            logger.info("🛑 Interrupção detectada")
        except Exception as e:
            logger.error(f"❌ Erro fatal: {e}")
            return False
        finally:
            self.cleanup()

def main():
    """Função principal"""
    server = ProductionLLMServer()
    return server.run()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
