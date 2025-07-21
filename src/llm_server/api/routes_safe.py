"""Rotas seguras da API para o servidor LLM."""

import gc
import time
from datetime import datetime
from typing import Dict, Any

from flask import Flask, request, jsonify

from ..core.model_manager_safe import SafeLlamaServer
from ..core.health_monitor import ServerHealth
from ..logs.logger import get_logger


def create_app_safe(server: SafeLlamaServer, health_monitor: ServerHealth) -> Flask:
    """Cria a aplicação Flask segura com as rotas configuradas."""
    app = Flask(__name__)
    logger = get_logger('llm_server.api_safe')

    @app.route('/health', methods=['GET'])
    def health():
        """Endpoint de verificação de saúde com monitoramento avançado."""
        request_start_time = time.time()

        try:
            logger.debug("🩺 Executando verificação de saúde...")

            # Obter status detalhado do monitoramento
            health_status = health_monitor.get_health_status()
            server_status = server.get_status()

            # Verificar integridade do modelo se carregado
            model_integrity = False
            if server_status["model_loaded"]:
                model_integrity = server.verify_model_integrity()
                if not model_integrity:
                    logger.warning(
                        "⚠️ Modelo carregado mas falhou na verificação de integridade"
                    )

            # Dados básicos do servidor
            basic_data = {
                "status": health_status["status"],
                "model_loaded": server_status["model_loaded"],
                "model_integrity": model_integrity,
                "load_time": server_status["load_time"],
                "request_count": server_status["request_count"],
                "timestamp": datetime.now().isoformat(),
            }

            # Dados de monitoramento avançado
            monitoring_data = {
                "uptime_seconds": health_status["uptime_seconds"],
                "consecutive_errors": health_status["consecutive_errors"],
                "error_rate_5min": health_status["error_rate_5min"],
                "recovery_attempts": health_status["recovery_attempts"],
                "total_requests_monitored": health_status["total_requests"],
                "recent_errors": health_status["recent_errors"],
            }

            # Combinar dados
            health_data = {**basic_data, "monitoring": monitoring_data}

            response_time = time.time() - request_start_time
            health_data["response_time_ms"] = round(response_time * 1000, 2)

            # Registrar requisição bem-sucedida
            health_monitor.record_request(success=True)

            return jsonify(health_data)

        except Exception as e:
            response_time = time.time() - request_start_time
            error_msg = f"❌ Erro no health check: {str(e)}"
            logger.error(error_msg, exc_info=True)

            # Registrar erro
            health_monitor.record_request(success=False, error_msg=str(e))

            # Resposta de erro
            error_response = {
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__,
                "model_loaded": server.get_status()["model_loaded"],
                "timestamp": datetime.now().isoformat(),
                "response_time_ms": round(response_time * 1000, 2),
            }

            return jsonify(error_response), 500

    @app.route('/load', methods=['POST'])
    def load_model():
        """Load model endpoint com verificações de segurança."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "JSON body required"}), 400

            model_path = data.get('model_path', './models/llama3-8b-instruct.Q4_K_M.gguf')

            from pathlib import Path
            if not Path(model_path).exists():
                return jsonify({"error": f"Model file not found: {model_path}"}), 404

            success = server.load_model(model_path)
            if success:
                return jsonify({
                    "status": "loaded",
                    "load_time": server.get_status()["load_time"]
                })
            else:
                return jsonify({"error": "Failed to load model"}), 500

        except Exception as e:
            logger.error(f"❌ Erro no endpoint /load: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route('/generate', methods=['POST'])
    def generate():
        """Generate response endpoint - llama.cpp compatible."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "JSON body required"}), 400

            prompt = data.get('prompt', '')
            max_tokens = data.get('max_tokens', data.get('n_predict', 512))
            temperature = data.get('temperature', 0.1)

            if not prompt:
                return jsonify({"error": "Prompt required"}), 400

            # Limitar parâmetros para segurança
            max_tokens = min(max(max_tokens, 1), 1024)
            temperature = max(0.0, min(temperature, 1.0))

            result = server.generate(prompt, max_tokens, temperature)

            # Return llama.cpp compatible format
            return jsonify({
                "content": result['text'],
                "tokens_predicted": result['tokens'],
                "timings": {
                    "predicted_ms": result['processing_time'] * 1000
                }
            })

        except Exception as e:
            logger.error(f"❌ Erro no endpoint /generate: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route('/completion', methods=['POST'])
    def completion():
        """Llama.cpp compatible completion endpoint."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "JSON body required"}), 400

            prompt = data.get('prompt', '')
            max_tokens = data.get('n_predict', data.get('max_tokens', 512))
            temperature = data.get('temperature', 0.1)

            if not prompt:
                return jsonify({"error": "Prompt required"}), 400

            # Limitar parâmetros para segurança
            max_tokens = min(max(max_tokens, 1), 1024)
            temperature = max(0.0, min(temperature, 1.0))

            result = server.generate(prompt, max_tokens, temperature)

            return jsonify({
                "choices": [{
                    "text": result['text'],
                    "finish_reason": "stop"
                }],
                "usage": {
                    "completion_tokens": result['tokens']
                },
                "timings": {
                    "predicted_ms": result['processing_time'] * 1000
                }
            })

        except Exception as e:
            logger.error(f"❌ Erro no endpoint /completion: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route('/validate', methods=['POST'])
    def validate():
        """Validation-specific endpoint com proteção contra falhas."""
        request_start = time.time()

        try:
            logger.info("🔍 Recebendo requisição de validação")

            # Validar dados de entrada
            if not request.is_json:
                error_msg = "❌ Content-Type deve ser application/json"
                logger.error(error_msg)
                return jsonify({"error": error_msg}), 400

            data = request.get_json()
            if not data:
                error_msg = "❌ Corpo da requisição vazio ou inválido"
                logger.error(error_msg)
                return jsonify({"error": error_msg}), 400

            csv_value = str(data.get('csv_value', ''))
            web_value = str(data.get('web_value', ''))
            field_type = str(data.get('field_type', 'string'))
            field_name = str(data.get('field_name', 'field'))

            logger.info(
                f"📋 Validando campo '{field_name}' (tipo: {field_type})",
                extra={
                    'csv_value_length': len(csv_value),
                    'web_value_length': len(web_value),
                    'csv_preview': csv_value[:50] + ('...' if len(csv_value) > 50 else ''),
                    'web_preview': web_value[:50] + ('...' if len(web_value) > 50 else ''),
                },
            )

            # Handle special characters and encoding
            try:
                csv_value = csv_value.encode('utf-8').decode('utf-8')
                web_value = web_value.encode('utf-8').decode('utf-8')
                logger.debug("✅ Encoding UTF-8 processado com sucesso")
            except Exception as enc_error:
                logger.warning(f"⚠️ Problema com encoding UTF-8: {enc_error}")

            # Prompt otimizado e seguro para validação
            prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a data validation expert. Compare two values and determine if they represent the same information.

RESPOND ONLY WITH VALID JSON in this exact format:
{{"match": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}}

Rules:
- Exact text matches = confidence 1.0
- Case differences = confidence 0.9-1.0
- Formatting differences (spaces, punctuation) = confidence 0.8-1.0
- Semantic equivalence = confidence 0.7-1.0
- Different values = confidence 0.0-0.3

Handle special characters, accents, and encoding properly.

<|eot_id|><|start_header_id|>user<|end_header_id|>
Field: {field_name} (type: {field_type})
CSV Value: "{csv_value}"
Web Value: "{web_value}"

Are these values equivalent? Respond with JSON only.<|eot_id|><|start_header_id|>assistant<|end_header_id|>"""

            logger.debug("🤖 Enviando prompt para o modelo LLM...")
            try:
                result = server.generate(prompt, max_tokens=100, temperature=0.1)
                logger.info(
                    f"✅ Resposta do modelo recebida",
                    extra={
                        'tokens': result['tokens'],
                        'processing_time': f"{result['processing_time']:.2f}s",
                    },
                )
            except Exception as gen_error:
                logger.error(f"💥 Erro na geração do modelo: {gen_error}", exc_info=True)
                raise

            # Clean and parse response
            response_text = result['text'].strip()
            logger.debug(f"📝 Texto da resposta: {response_text[:200]}...")

            # Remove any markdown formatting
            response_text = response_text.replace('```json', '').replace('```', '').strip()

            # Try to extract JSON
            logger.debug("🔍 Tentando extrair JSON da resposta...")

            # Função auxiliar para extrair JSON
            def extract_json_from_text(text: str):
                """Extract JSON from text response."""
                import json
                import re

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

            json_data = extract_json_from_text(response_text)

            if json_data and all(
                key in json_data for key in ['match', 'confidence', 'reasoning']
            ):
                logger.info(
                    "✅ JSON extraído com sucesso",
                    extra={
                        'match': json_data.get('match'),
                        'confidence': json_data.get('confidence'),
                        'reasoning_preview': str(json_data.get('reasoning', ''))[:50],
                    },
                )

                # Ensure correct types
                final_result = {
                    "match": bool(json_data.get('match', False)),
                    "confidence": float(
                        min(max(json_data.get('confidence', 0.5), 0.0), 1.0)
                    ),
                    "reasoning": str(json_data.get('reasoning', 'Validação concluída')),
                    "processing_time": result['processing_time'],
                    "tokens": result['tokens'],
                }

                total_time = time.time() - request_start
                logger.info(
                    f"🎉 Validação concluída com sucesso",
                    extra={'total_time': f"{total_time:.2f}s", 'field_name': field_name},
                )

                return jsonify(final_result)

            # Fallback with structured parsing
            logger.warning("⚠️ Falha ao extrair JSON, usando fallback de comparação de strings")
            match = False
            confidence = 0.5

            # Simple string comparison as fallback
            csv_norm = csv_value.lower().strip()
            web_norm = web_value.lower().strip()

            if csv_norm == web_norm:
                match = True
                confidence = 1.0
            elif csv_norm.replace(' ', '') == web_norm.replace(' ', ''):
                match = True
                confidence = 0.9
            elif csv_norm in web_norm or web_norm in csv_norm:
                match = True
                confidence = 0.7

            fallback_result = {
                "match": match,
                "confidence": confidence,
                "reasoning": "Comparação de string fallback",
                "processing_time": result['processing_time'],
                "tokens": result['tokens'],
            }

            total_time = time.time() - request_start
            logger.info(
                f"🔄 Validação concluída via fallback",
                extra={'total_time': f"{total_time:.2f}s", 'field_name': field_name, 'match': match},
            )

            return jsonify(fallback_result)

        except Exception as e:
            total_time = time.time() - request_start
            error_msg = f"💥 Erro na validação: {str(e)}"
            logger.error(
                error_msg,
                extra={'total_time': f"{total_time:.2f}s", 'error_type': type(e).__name__},
                exc_info=True,
            )

            return jsonify(
                {
                    "match": False,
                    "confidence": 0.0,
                    "reasoning": f"Erro: {str(e)}",
                    "processing_time": 0,
                    "tokens": 0,
                }
            ), 500

    return app
