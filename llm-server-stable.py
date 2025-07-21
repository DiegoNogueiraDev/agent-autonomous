#!/usr/bin/env python3
"""
DataHawk LLM Server - Versão Ultra Estável
Corrige problemas de segmentation fault usando configurações conservadoras
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

from flask import Flask, request, jsonify
from llama_cpp import Llama

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(name)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/llm-server-stable.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('llm_server_stable')

# Configurações ultra conservadoras
CONFIG = {
    'model_path': 'models/phi-3-mini-4k-instruct.Q4_K_M.gguf',  # Modelo menor
    'n_ctx': 2048,          # Context reduzido
    'n_threads': 1,         # Single thread para estabilidade
    'n_batch': 128,         # Batch pequeno
    'n_gpu_layers': 0,      # CPU only
    'verbose': False,       # Reduzir logging
    'use_mmap': True,       # Memory mapping
    'use_mlock': False,     # Sem memory lock
    'low_vram': True,       # Low VRAM mode
    'f16_kv': False,        # Use f32 para estabilidade
    'logits_all': False,    # Salvar memória
    'vocab_only': False,    # Carregar vocabulário completo
    'embedding': False,     # Sem embeddings
    'n_parts': 1,          # Single part
    'seed': 42,            # Seed fixo
    'f32_kv': True,        # Force f32 para estabilidade
    'host': '127.0.0.1',
    'port': 8000
}

class StableLLMServer:
    def __init__(self):
        self.model: Optional[Llama] = None
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

    def check_system_resources(self) -> bool:
        """Verifica se o sistema tem recursos suficientes"""
        try:
            # Verificar RAM disponível
            memory = psutil.virtual_memory()
            available_gb = memory.available / (1024**3)

            logger.info(f"💾 Memória disponível: {available_gb:.1f}GB")

            if available_gb < 3.0:  # Mínimo para phi-3-mini
                logger.error(f"❌ Memória insuficiente: {available_gb:.1f}GB < 3.0GB")
                return False

            # Verificar se o modelo existe
            model_path = Path(CONFIG['model_path'])
            if not model_path.exists():
                logger.error(f"❌ Modelo não encontrado: {model_path}")
                return False

            model_size_gb = model_path.stat().st_size / (1024**3)
            logger.info(f"📦 Tamanho do modelo: {model_size_gb:.1f}GB")

            return True

        except Exception as e:
            logger.error(f"❌ Erro verificando recursos: {e}")
            return False

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
        """Carrega o modelo LLM com configurações ultra conservadoras"""
        try:
            if not self.check_system_resources():
                return False

            with self.safe_model_loading():
                logger.info(f"📚 Carregando modelo: {CONFIG['model_path']}")
                logger.info(f"🔧 Configurações: ctx={CONFIG['n_ctx']}, threads={CONFIG['n_threads']}, batch={CONFIG['n_batch']}")

                # Configurações ultra conservadoras
                self.model = Llama(
                    model_path=CONFIG['model_path'],
                    n_ctx=CONFIG['n_ctx'],
                    n_threads=CONFIG['n_threads'],
                    n_batch=CONFIG['n_batch'],
                    n_gpu_layers=CONFIG['n_gpu_layers'],
                    verbose=CONFIG['verbose'],
                    use_mmap=CONFIG['use_mmap'],
                    use_mlock=CONFIG['use_mlock'],
                    low_vram=CONFIG['low_vram'],
                    f16_kv=CONFIG['f16_kv'],
                    logits_all=CONFIG['logits_all'],
                    vocab_only=CONFIG['vocab_only'],
                    embedding=CONFIG['embedding'],
                    n_parts=CONFIG['n_parts'],
                    seed=CONFIG['seed'],
                    f32_kv=CONFIG['f32_kv']
                )

                # Teste básico para verificar se o modelo está funcional
                logger.info("🧪 Testando modelo...")
                test_response = self.model.create_completion(
                    prompt="Test: ",
                    max_tokens=1,
                    temperature=0.1,
                    top_p=0.9
                )

                if test_response and 'choices' in test_response:
                    logger.info("✅ Modelo funcional confirmado")
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
                    'timestamp': time.time(),
                    'memory_usage': f"{psutil.virtual_memory().percent:.1f}%"
                }
                return jsonify(status), 200 if self.model else 503
            except Exception as e:
                logger.error(f"❌ Health check falhou: {e}")
                return jsonify({'status': 'error', 'error': str(e)}), 500

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

                # Prompt otimizado para o phi-3-mini
                prompt = f"""Compare these values:
CSV: "{csv_value[:100]}"
WEB: "{web_value[:100]}"
Type: {field_type}

Are they the same? Answer only: YES or NO"""

                # Geração com configurações conservadoras
                response = self.model.create_completion(
                    prompt=prompt,
                    max_tokens=10,
                    temperature=0.1,
                    top_p=0.9,
                    stop=["\n", ".", "?", "!"],
                    echo=False
                )

                if response and 'choices' in response and len(response['choices']) > 0:
                    answer = response['choices'][0]['text'].strip().upper()
                    match = 'YES' in answer
                    confidence = 0.9 if match else 0.1

                    return jsonify({
                        'match': match,
                        'confidence': confidence,
                        'reasoning': f"LLM response: {answer}",
                        'csv_value': csv_value,
                        'web_value': web_value
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
            logger.info("🚀 Iniciando DataHawk LLM Server - Versão Ultra Estável")
            logger.info("📦 Usando modelo Phi-3-Mini para máxima estabilidade")

            # Criar diretório de logs se não existir
            os.makedirs('logs', exist_ok=True)

            # Carregar modelo
            if not self.load_model():
                logger.error("❌ Falha ao carregar modelo. Servidor não iniciará.")
                return False

            logger.info(f"🌐 Iniciando servidor HTTP em {CONFIG['host']}:{CONFIG['port']}")

            # Executar servidor Flask
            self.app.run(
                host=CONFIG['host'],
                port=CONFIG['port'],
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
    server = StableLLMServer()
    return server.run()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
