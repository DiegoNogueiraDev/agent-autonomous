#!/usr/bin/env python3
"""
DataHawk LLM Server - Versão de Produção v2.0
Sistema Multi-Modelo Inteligente com Aprendizado Retroativo
Suporte para: TinyLlama, Qwen-1.8B, Gemma-2B, Phi-3-Mini
"""

import os
import sys
import gc
import time
import json
import yaml
import signal
import psutil
import logging
import hashlib
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta

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

logger = logging.getLogger('llm_server_production_v2')

@dataclass
class ModelConfig:
    """Configurações otimizadas para diferentes modelos"""
    name: str
    path: str
    memory_requirement_gb: float
    description: str
    strengths: List[str]
    optimal_for: List[str]
    n_ctx: int
    n_threads: int
    n_batch: int
    temperature: float

@dataclass
class ValidationDecision:
    """Registro de decisão de validação para aprendizado"""
    id: str
    timestamp: datetime
    csv_value: str
    web_value: str
    field_type: str
    model_used: str
    match: bool
    confidence: float
    reasoning: str
    processing_time_ms: int

class LearningSystem:
    """Sistema de aprendizado retroativo"""

    def __init__(self, db_path: str = "data/learning.db"):
        self.db_path = db_path
        self.setup_database()

    def setup_database(self):
        """Configura banco de dados SQLite para armazenar decisões"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS validation_decisions (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    csv_value TEXT NOT NULL,
                    web_value TEXT NOT NULL,
                    field_type TEXT NOT NULL,
                    model_used TEXT NOT NULL,
                    match INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    reasoning TEXT,
                    processing_time_ms INTEGER,
                    hash_key TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_field_type ON validation_decisions(field_type)
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_hash_key ON validation_decisions(hash_key)
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_timestamp ON validation_decisions(timestamp)
            """)

    def store_decision(self, decision: ValidationDecision):
        """Armazena decisão de validação"""
        try:
            # Criar hash único para detectar padrões similares
            hash_key = hashlib.md5(
                f"{decision.csv_value.lower()}:{decision.web_value.lower()}:{decision.field_type}".encode()
            ).hexdigest()

            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO validation_decisions
                    (id, timestamp, csv_value, web_value, field_type, model_used,
                     match, confidence, reasoning, processing_time_ms, hash_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    decision.id,
                    decision.timestamp.isoformat(),
                    decision.csv_value,
                    decision.web_value,
                    decision.field_type,
                    decision.model_used,
                    int(decision.match),
                    decision.confidence,
                    decision.reasoning,
                    decision.processing_time_ms,
                    hash_key
                ))

        except Exception as e:
            logger.error(f"Erro ao armazenar decisão: {e}")

    def find_similar_decision(self, csv_value: str, web_value: str, field_type: str, similarity_threshold: float = 0.95) -> Optional[ValidationDecision]:
        """Busca decisão similar baseada em hash"""
        try:
            hash_key = hashlib.md5(
                f"{csv_value.lower()}:{web_value.lower()}:{field_type}".encode()
            ).hexdigest()

            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT * FROM validation_decisions
                    WHERE hash_key = ? AND confidence >= ?
                    ORDER BY timestamp DESC LIMIT 1
                """, (hash_key, similarity_threshold))

                row = cursor.fetchone()
                if row:
                    return ValidationDecision(
                        id=row[0],
                        timestamp=datetime.fromisoformat(row[1]),
                        csv_value=row[2],
                        web_value=row[3],
                        field_type=row[4],
                        model_used=row[5],
                        match=bool(row[6]),
                        confidence=row[7],
                        reasoning=row[8] or "",
                        processing_time_ms=row[9] or 0
                    )
        except Exception as e:
            logger.error(f"Erro ao buscar decisão similar: {e}")

        return None

    def get_model_performance(self, model_name: str, field_type: str = None) -> Dict[str, float]:
        """Retorna métricas de performance do modelo"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                where_clause = "WHERE model_used = ?"
                params = [model_name]

                if field_type:
                    where_clause += " AND field_type = ?"
                    params.append(field_type)

                cursor = conn.execute(f"""
                    SELECT
                        AVG(confidence) as avg_confidence,
                        AVG(processing_time_ms) as avg_processing_time,
                        COUNT(*) as total_decisions,
                        SUM(CASE WHEN confidence >= 0.8 THEN 1 ELSE 0 END) as high_confidence_count
                    FROM validation_decisions
                    {where_clause}
                """, params)

                row = cursor.fetchone()
                if row and row[2] > 0:  # total_decisions > 0
                    return {
                        'avg_confidence': row[0] or 0.0,
                        'avg_processing_time_ms': row[1] or 0.0,
                        'total_decisions': row[2],
                        'high_confidence_rate': (row[3] or 0) / row[2]
                    }
        except Exception as e:
            logger.error(f"Erro ao obter performance do modelo: {e}")

        return {
            'avg_confidence': 0.0,
            'avg_processing_time_ms': 0.0,
            'total_decisions': 0,
            'high_confidence_rate': 0.0
        }

class ModelSelector:
    """Seletor inteligente de modelos baseado em configuração"""

    def __init__(self, config_path: str = "llm-production.yaml"):
        self.config = self.load_config(config_path)
        self.field_type_mapping = self.config.get('llm', {}).get('field_type_mapping', {})
        self.auto_selection = self.config.get('llm', {}).get('auto_selection', {})

    def load_config(self, config_path: str) -> Dict[str, Any]:
        """Carrega configuração YAML"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Erro ao carregar configuração: {e}")
            return {}

    def select_model_for_field_type(self, field_type: str, available_models: List[str]) -> str:
        """Seleciona modelo ideal para tipo de campo"""
        # Verificar mapeamento direto
        if field_type in self.field_type_mapping:
            preferred_model = self.field_type_mapping[field_type]
            if preferred_model in available_models:
                return preferred_model

        # Fallback para ordem de fallback configurada
        fallback_order = self.auto_selection.get('fallback_order', available_models)
        for model in fallback_order:
            if model in available_models:
                return model

        # Último recurso: primeiro modelo disponível
        return available_models[0] if available_models else None

# Modelos recomendados em ordem de capacidade
SUPPORTED_MODELS = [
    ModelConfig(
        name="tinyllama",
        path="models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        memory_requirement_gb=1.5,
        description="TinyLlama 1.1B - Ultra rápido, baixo consumo de RAM",
        strengths=["speed", "low_memory"],
        optimal_for=["simple_validation", "quick_comparisons", "id", "code", "category"],
        n_ctx=1024,
        n_threads=2,
        n_batch=64,
        temperature=0.2
    ),
    ModelConfig(
        name="qwen-1.8b",
        path="models/qwen1.5-1.8b-chat.Q4_K_M.gguf",
        memory_requirement_gb=2.0,
        description="Qwen 1.8B - Bom para raciocínio numérico e lógica",
        strengths=["numerical_reasoning", "logical_thinking"],
        optimal_for=["number_validation", "cpf_cnpj", "financial_data", "number", "currency", "percentage"],
        n_ctx=2048,
        n_threads=2,
        n_batch=128,
        temperature=0.1
    ),
    ModelConfig(
        name="gemma-2b",
        path="models/gemma-2b-it.Q4_K_M.gguf",
        memory_requirement_gb=2.5,
        description="Gemma 2B - Equilibrado, excelente em PT-BR",
        strengths=["portuguese", "text_understanding", "cultural_context"],
        optimal_for=["name_validation", "address_validation", "portuguese_text", "name", "address", "city", "description"],
        n_ctx=2048,
        n_threads=3,
        n_batch=128,
        temperature=0.1
    ),
    ModelConfig(
        name="phi3-mini",
        path="models/phi-3-mini-4k-instruct.Q4_K_M.gguf",
        memory_requirement_gb=3.5,
        description="Phi-3 Mini - Qualidade superior geral",
        strengths=["general_intelligence", "complex_reasoning", "accuracy"],
        optimal_for=["complex_validation", "mixed_content", "fallback", "email", "phone", "mixed", "complex"],
        n_ctx=4096,
        n_threads=3,
        n_batch=128,
        temperature=0.1
    )
]

class ProductionLLMServerV2:
    def __init__(self):
        self.models: Dict[str, Llama] = {}  # Cache de modelos carregados
        self.current_model_config: Optional[ModelConfig] = None
        self.model_selector = ModelSelector()
        self.learning_system = LearningSystem()
        self.app = Flask(__name__)
        self.setup_routes()
        self.setup_signal_handlers()
        self.request_count = 0

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

    def get_available_models(self) -> List[ModelConfig]:
        """Lista modelos que cabem na memória e existem no disco"""
        available_memory = self.get_available_memory_gb()
        memory_threshold = self.model_selector.auto_selection.get('memory_threshold_gb', 0.5)

        available_models = []
        for model in SUPPORTED_MODELS:
            # Verificar se há memória suficiente
            if model.memory_requirement_gb <= (available_memory - memory_threshold):
                # Verificar se arquivo existe
                model_path = Path(model.path)
                if model_path.exists():
                    available_models.append(model)
                    logger.info(f"✅ Modelo disponível: {model.name} ({model.description})")
                else:
                    logger.info(f"⚠️ Modelo não encontrado: {model.path}")
            else:
                logger.info(f"❌ Modelo requer muita RAM: {model.name} ({model.memory_requirement_gb:.1f}GB)")

        return available_models

    def select_model_for_request(self, field_type: str = None) -> Optional[ModelConfig]:
        """Seleciona melhor modelo para a requisição"""
        available_models = self.get_available_models()
        if not available_models:
            return None

        available_model_names = [m.name for m in available_models]

        if field_type:
            selected_name = self.model_selector.select_model_for_field_type(field_type, available_model_names)
        else:
            # Sem tipo especificado, usar ordem de fallback
            fallback_order = self.model_selector.auto_selection.get('fallback_order', available_model_names)
            selected_name = None
            for name in fallback_order:
                if name in available_model_names:
                    selected_name = name
                    break

        # Encontrar configuração do modelo selecionado
        for model in available_models:
            if model.name == selected_name:
                return model

        return available_models[0] if available_models else None

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
            gc.collect()
            raise

    def load_model(self, model_config: ModelConfig) -> bool:
        """Carrega modelo específico"""
        try:
            # Verificar se modelo já está carregado
            if model_config.name in self.models:
                self.current_model_config = model_config
                logger.info(f"✅ Modelo {model_config.name} já carregado")
                return True

            with self.safe_model_loading():
                logger.info(f"📚 Carregando {model_config.name}: {model_config.path}")
                logger.info(f"🔧 Configurações: ctx={model_config.n_ctx}, threads={model_config.n_threads}, batch={model_config.n_batch}")

                # Configurações ultra conservadoras
                self.models[model_config.name] = Llama(
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
                test_response = self.models[model_config.name].create_completion(
                    prompt="Teste rápido:",
                    max_tokens=3,
                    temperature=model_config.temperature,
                    top_p=0.9,
                    stop=["\n"]
                )

                if test_response and 'choices' in test_response:
                    self.current_model_config = model_config
                    logger.info(f"✅ Modelo {model_config.name} funcional!")
                    return True
                else:
                    logger.error("❌ Teste do modelo falhou")
                    return False

        except Exception as e:
            logger.error(f"❌ Erro carregando modelo {model_config.name}: {e}")
            # Limpar modelo defeituoso do cache
            if model_config.name in self.models:
                del self.models[model_config.name]
            return False

    def setup_routes(self):
        """Configura rotas da API"""

        @self.app.route('/health', methods=['GET'])
        def health():
            """Health check endpoint"""
            try:
                available_models = self.get_available_models()
                loaded_models = list(self.models.keys())

                status = {
                    'status': 'healthy' if self.models else 'no_models_loaded',
                    'models_loaded': loaded_models,
                    'models_available': [m.name for m in available_models],
                    'current_model': self.current_model_config.name if self.current_model_config else None,
                    'current_model_description': self.current_model_config.description if self.current_model_config else None,
                    'timestamp': time.time(),
                    'memory_usage': f"{psutil.virtual_memory().percent:.1f}%",
                    'available_memory_gb': f"{self.get_available_memory_gb():.1f}GB",
                    'request_count': self.request_count,
                    'learning_system_enabled': True
                }
                return jsonify(status), 200 if self.models else 503
            except Exception as e:
                logger.error(f"❌ Health check falhou: {e}")
                return jsonify({'status': 'error', 'error': str(e)}), 500

        @self.app.route('/models', methods=['GET'])
        def list_models():
            """Lista modelos disponíveis com métricas"""
            try:
                available_memory = self.get_available_memory_gb()
                models_info = []

                for model in SUPPORTED_MODELS:
                    model_path = Path(model.path)
                    performance = self.learning_system.get_model_performance(model.name)

                    models_info.append({
                        'name': model.name,
                        'description': model.description,
                        'path': model.path,
                        'memory_requirement_gb': model.memory_requirement_gb,
                        'file_exists': model_path.exists(),
                        'can_load': model.memory_requirement_gb <= available_memory and model_path.exists(),
                        'is_loaded': model.name in self.models,
                        'is_current': self.current_model_config and self.current_model_config.name == model.name,
                        'strengths': model.strengths,
                        'optimal_for': model.optimal_for,
                        'performance': performance,
                        'settings': {
                            'context_size': model.n_ctx,
                            'threads': model.n_threads,
                            'batch_size': model.n_batch,
                            'temperature': model.temperature
                        }
                    })

                return jsonify({
                    'available_memory_gb': available_memory,
                    'models': models_info,
                    'field_type_mapping': self.model_selector.field_type_mapping
                }), 200
            except Exception as e:
                logger.error(f"❌ Erro listando modelos: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/validate', methods=['POST'])
        def validate():
            """Endpoint de validação específico para DataHawk v2.0"""
            start_time = time.time()
            self.request_count += 1

            try:
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
                field_name = data.get('field_name', 'unknown')

                # Buscar decisão similar no cache
                similar_decision = self.learning_system.find_similar_decision(csv_value, web_value, field_type)
                if similar_decision:
                    processing_time = int((time.time() - start_time) * 1000)
                    logger.info(f"💾 Cache hit para {field_name} ({field_type})")
                    return jsonify({
                        'match': similar_decision.match,
                        'confidence': similar_decision.confidence,
                        'reasoning': f"Cache: {similar_decision.reasoning}",
                        'csv_value': csv_value,
                        'web_value': web_value,
                        'model_used': f"cache({similar_decision.model_used})",
                        'processing_time_ms': processing_time,
                        'from_cache': True
                    }), 200

                # Selecionar modelo apropriado para o tipo de campo
                model_config = self.select_model_for_request(field_type)
                if not model_config:
                    return jsonify({
                        'error': 'Nenhum modelo adequado disponível',
                        'match': False,
                        'confidence': 0.0
                    }), 503

                # Carregar modelo se necessário
                if not self.load_model(model_config):
                    return jsonify({
                        'error': f'Falha ao carregar modelo {model_config.name}',
                        'match': False,
                        'confidence': 0.0
                    }), 503

                # Gerar prompt adaptativo baseado no modelo
                if model_config.name == "tinyllama":
                    # Prompt muito simples para TinyLlama
                    prompt = f"CSV: {csv_value[:30]}\nWEB: {web_value[:30]}\nSame?"
                    max_tokens = 2
                elif model_config.name == "qwen-1.8b" and field_type in ["number", "cpf", "cnpj", "currency"]:
                    # Prompt especializado para números
                    prompt = f"Compare numbers:\nCSV: {csv_value[:50]}\nWEB: {web_value[:50]}\nEqual? YES/NO"
                    max_tokens = 3
                elif model_config.name == "gemma-2b" and field_type in ["name", "address", "city"]:
                    # Prompt em português para Gemma
                    prompt = f"Compare os textos:\nCSV: \"{csv_value[:80]}\"\nWEB: \"{web_value[:80]}\"\nIguais? SIM/NÃO"
                    max_tokens = 3
                else:
                    # Prompt padrão para Phi-3 e casos complexos
                    prompt = f"""Compare these values:
CSV: "{csv_value[:100]}"
WEB: "{web_value[:100]}"
Type: {field_type}
Are they the same? Answer: YES or NO"""
                    max_tokens = 5

                # Geração com configurações do modelo
                response = self.models[model_config.name].create_completion(
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=model_config.temperature,
                    top_p=0.9,
                    stop=["\n", ".", "?", "!", " ", ","],
                    echo=False
                )

                processing_time = int((time.time() - start_time) * 1000)

                if response and 'choices' in response and len(response['choices']) > 0:
                    answer = response['choices'][0]['text'].strip().upper()

                    # Determinar match baseado na resposta
                    match = any(word in answer for word in ['YES', 'SIM', 'TRUE', 'IGUAL'])
                    confidence = 0.85 if match else 0.15

                    # Ajustar confiança baseada no modelo
                    if model_config.name in ["phi3-mini", "gemma-2b"]:
                        confidence = min(0.95, confidence + 0.1)  # Modelos melhores têm confiança maior
                    elif model_config.name == "tinyllama":
                        confidence = max(0.1, confidence - 0.1)  # TinyLlama tem confiança menor

                    reasoning = f"LLM ({model_config.name}): {answer[:50]}"

                    # Armazenar decisão para aprendizado futuro
                    decision = ValidationDecision(
                        id=f"{self.request_count}_{int(time.time())}",
                        timestamp=datetime.now(),
                        csv_value=csv_value,
                        web_value=web_value,
                        field_type=field_type,
                        model_used=model_config.name,
                        match=match,
                        confidence=confidence,
                        reasoning=reasoning,
                        processing_time_ms=processing_time
                    )

                    # Só armazenar se confiança for alta o suficiente
                    if confidence >= 0.7:
                        self.learning_system.store_decision(decision)

                    return jsonify({
                        'match': match,
                        'confidence': confidence,
                        'reasoning': reasoning,
                        'csv_value': csv_value,
                        'web_value': web_value,
                        'model_used': model_config.name,
                        'field_type': field_type,
                        'processing_time_ms': processing_time,
                        'from_cache': False
                    }), 200
                else:
                    logger.error("❌ Resposta vazia do modelo")
                    return jsonify({
                        'error': 'Resposta vazia do modelo',
                        'match': False,
                        'confidence': 0.0,
                        'model_used': model_config.name
                    }), 500

            except Exception as e:
                processing_time = int((time.time() - start_time) * 1000)
                logger.error(f"❌ Erro na validação: {e}")
                return jsonify({
                    'error': f'Erro interno: {str(e)}',
                    'match': False,
                    'confidence': 0.0,
                    'processing_time_ms': processing_time
                }), 500

        @self.app.route('/metrics', methods=['GET'])
        def metrics():
            """Endpoint de métricas para monitoramento"""
            try:
                metrics_data = {
                    'server_stats': {
                        'uptime_seconds': time.time(),
                        'request_count': self.request_count,
                        'memory_usage_percent': psutil.virtual_memory().percent,
                        'available_memory_gb': self.get_available_memory_gb()
                    },
                    'models_performance': {},
                    'field_type_distribution': {}
                }

                # Performance por modelo
                for model in SUPPORTED_MODELS:
                    metrics_data['models_performance'][model.name] = self.learning_system.get_model_performance(model.name)

                return jsonify(metrics_data), 200
            except Exception as e:
                logger.error(f"❌ Erro nas métricas: {e}")
                return jsonify({'error': str(e)}), 500

    def cleanup(self):
        """Limpeza de recursos"""
        try:
            logger.info("🧹 Limpando modelos...")
            for model_name in list(self.models.keys()):
                del self.models[model_name]
            self.models.clear()
            gc.collect()
            logger.info("✅ Limpeza concluída")
        except Exception as e:
            logger.error(f"❌ Erro na limpeza: {e}")

    def run(self):
        """Executa o servidor"""
        try:
            logger.info("🚀 Iniciando DataHawk LLM Server v2.0 - Sistema Multi-Modelo")
            logger.info("📦 Suporte para: TinyLlama, Qwen-1.8B, Gemma-2B, Phi-3-Mini")
            logger.info("🧠 Sistema de aprendizado retroativo ativo")

            # Criar diretório de logs se não existir
            os.makedirs('logs', exist_ok=True)
            os.makedirs('data', exist_ok=True)

            # Verificar modelos disponíveis
            available_models = self.get_available_models()
            if not available_models:
                logger.error("❌ Nenhum modelo adequado encontrado. Servidor iniciará sem modelos.")
                logger.info("💡 Dica: Baixe modelos com: bash scripts/download-recommended-models.sh")
            else:
                logger.info(f"✅ {len(available_models)} modelos disponíveis")
                for model in available_models:
                    logger.info(f"   • {model.name}: {model.description}")

            logger.info(f"🌐 Iniciando servidor HTTP em 127.0.0.1:8000")

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
    server = ProductionLLMServerV2()
    return server.run()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
