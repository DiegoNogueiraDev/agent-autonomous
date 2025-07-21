#!/usr/bin/env python3
"""
DataHawk LLM Server
Servidor Python que expõe o modelo Llama-3 8B via HTTP para o Node.js
"""

import os
import sys
import json
import time
import re
import traceback
import logging
import gc
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify
from llama_cpp import Llama

# Configurar logging em português
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
llm = None

class LlamaServer:
    def __init__(self):
        self.llm = None
        self.model_loaded = False
        self.load_time = 0
        self.request_count = 0

    def load_model(self, model_path: str):
        """Load the Llama model"""
        if self.model_loaded:
            logger.info("🔄 Modelo já carregado, retornando sucesso")
            return True

        logger.info(f"🔄 Carregando modelo de {model_path}...")
        print(f"🔄 Carregando modelo de {model_path}...")
        start_time = time.time()

        try:
            # Verificar se o arquivo existe
            if not Path(model_path).exists():
                error_msg = f"❌ Arquivo do modelo não encontrado: {model_path}"
                logger.error(error_msg)
                print(error_msg)
                return False

            # Verificar tamanho do arquivo
            file_size = Path(model_path).stat().st_size / (1024 * 1024 * 1024)  # GB
            logger.info(f"📊 Tamanho do modelo: {file_size:.2f} GB")
            print(f"📊 Tamanho do modelo: {file_size:.2f} GB")

            logger.info("🔧 Inicializando Llama com configurações...")
            self.llm = Llama(
                model_path=model_path,
                n_ctx=8192,
                n_threads=4,
                n_batch=512,
                verbose=False
            )

            self.load_time = time.time() - start_time
            self.model_loaded = True
            success_msg = f"✅ Modelo carregado com sucesso em {self.load_time:.1f}s"
            logger.info(success_msg)
            print(success_msg)
            return True

        except Exception as e:
            error_msg = f"❌ Falha ao carregar modelo: {e}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)
            print(f"🔍 Stack trace: {traceback.format_exc()}")
            return False

    def generate(self, prompt: str, max_tokens: int = 1024, temperature: float = 0.1):
        """Generate response from the model"""
        if not self.model_loaded:
            error_msg = "❌ Modelo não carregado"
            logger.error(error_msg)
            raise RuntimeError(error_msg)

        self.request_count += 1
        start_time = time.time()

        logger.info(f"🤖 Gerando resposta (requisição #{self.request_count})", extra={
            'prompt_length': len(prompt),
            'max_tokens': max_tokens,
            'temperature': temperature
        })

        try:
            logger.debug("📤 Enviando prompt para o modelo...")
            response = self.llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=["\n\n", "}", "END"],
                echo=False
            )

            processing_time = time.time() - start_time
            result_text = response['choices'][0]['text'].strip()
            
            logger.info(f"✅ Resposta gerada com sucesso", extra={
                'processing_time': f"{processing_time:.2f}s",
                'tokens_generated': response['usage']['completion_tokens'],
                'response_length': len(result_text),
                'request_id': self.request_count
            })

            return {
                "text": result_text,
                "tokens": response['usage']['completion_tokens'],
                "processing_time": processing_time,
                "model": "llama3-8b-instruct"
            }

        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = f"❌ Falha na geração: {e}"
            logger.error(error_msg, extra={
                'processing_time': f"{processing_time:.2f}s",
                'request_id': self.request_count,
                'error_type': type(e).__name__
            }, exc_info=True)
            print(error_msg)
            raise

    def extract_json_from_text(self, text: str):
        """Extract JSON from text response"""
        # Look for JSON pattern
        json_pattern = r'\{[^}]+\}'
        matches = re.findall(json_pattern, text)

        if matches:
            try:
                # Try to parse the first JSON object found
                return json.loads(matches[0])
            except:
                pass

        return None

# Global server instance
server = LlamaServer()

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint with basic monitoring"""
    try:
        health_data = {
            "status": "healthy",
            "model_loaded": server.model_loaded,
            "load_time": server.load_time,
            "request_count": server.request_count,
            "timestamp": datetime.now().isoformat()
        }
        
        # Log a cada 10 requisições para monitorar atividade
        if server.request_count % 10 == 0 and server.request_count > 0:
            logger.info(f"📊 Status de saúde (requisição #{server.request_count})")
            
            # Executar garbage collection periodicamente
            logger.debug("🧹 Executando garbage collection...")
            gc.collect()
        
        return jsonify(health_data)
        
    except Exception as e:
        logger.error(f"❌ Erro no health check: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": str(e),
            "model_loaded": server.model_loaded if 'server' in globals() else False,
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/load', methods=['POST'])
def load_model():
    """Load model endpoint"""
    data = request.get_json()
    model_path = data.get('model_path', './models/llama3-8b-instruct.Q4_K_M.gguf')

    if not Path(model_path).exists():
        return jsonify({"error": f"Model file not found: {model_path}"}), 404

    success = server.load_model(model_path)
    if success:
        return jsonify({"status": "loaded", "load_time": server.load_time})
    else:
        return jsonify({"error": "Failed to load model"}), 500

@app.route('/generate', methods=['POST'])
def generate():
    """Generate response endpoint - llama.cpp compatible"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        max_tokens = data.get('max_tokens', data.get('n_predict', 1024))
        temperature = data.get('temperature', 0.1)

        if not prompt:
            return jsonify({"error": "Prompt required"}), 400

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
        return jsonify({"error": str(e)}), 500

@app.route('/completion', methods=['POST'])
def completion():
    """Llama.cpp compatible completion endpoint"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        max_tokens = data.get('n_predict', data.get('max_tokens', 1024))
        temperature = data.get('temperature', 0.1)
        stop = data.get('stop', ['\n'])

        if not prompt:
            return jsonify({"error": "Prompt required"}), 400

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
        return jsonify({"error": str(e)}), 500

@app.route('/validate', methods=['POST'])
def validate():
    """Validation-specific endpoint with guaranteed JSON format"""
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

        logger.info(f"📋 Validando campo '{field_name}' (tipo: {field_type})", extra={
            'csv_value_length': len(csv_value),
            'web_value_length': len(web_value),
            'csv_preview': csv_value[:50] + ('...' if len(csv_value) > 50 else ''),
            'web_preview': web_value[:50] + ('...' if len(web_value) > 50 else '')
        })

        # Handle special characters and encoding
        try:
            csv_value = csv_value.encode('utf-8').decode('utf-8')
            web_value = web_value.encode('utf-8').decode('utf-8')
            logger.debug("✅ Encoding UTF-8 processado com sucesso")
        except Exception as enc_error:
            logger.warning(f"⚠️ Problema com encoding UTF-8: {enc_error}")

        # Optimized prompt for validation
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
            result = server.generate(prompt, max_tokens=150, temperature=0.1)
            logger.info(f"✅ Resposta do modelo recebida", extra={
                'tokens': result['tokens'],
                'processing_time': f"{result['processing_time']:.2f}s"
            })
        except Exception as gen_error:
            logger.error(f"💥 Erro na geração do modelo: {gen_error}", exc_info=True)
            raise

        # Clean and parse response
        response_text = result['text'].strip()
        logger.debug(f"📝 Texto da resposta: {response_text[:200]}...")

        # Remove any markdown formatting
        response_text = re.sub(r'```json\s*', '', response_text)
        response_text = re.sub(r'\s*```', '', response_text)
        response_text = response_text.strip()

        # Try to extract JSON
        logger.debug("🔍 Tentando extrair JSON da resposta...")
        json_data = server.extract_json_from_text(response_text)

        if json_data and all(key in json_data for key in ['match', 'confidence', 'reasoning']):
            logger.info("✅ JSON extraído com sucesso", extra={
                'match': json_data.get('match'),
                'confidence': json_data.get('confidence'),
                'reasoning_preview': str(json_data.get('reasoning', ''))[:50]
            })
            
            # Ensure correct types
            final_result = {
                "match": bool(json_data.get('match', False)),
                "confidence": float(min(max(json_data.get('confidence', 0.5), 0.0), 1.0)),
                "reasoning": str(json_data.get('reasoning', 'Validação concluída')),
                "processing_time": result['processing_time'],
                "tokens": result['tokens']
            }
            
            total_time = time.time() - request_start
            logger.info(f"🎉 Validação concluída com sucesso", extra={
                'total_time': f"{total_time:.2f}s",
                'field_name': field_name
            })
            
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
            "tokens": result['tokens']
        }
        
        total_time = time.time() - request_start
        logger.info(f"🔄 Validação concluída via fallback", extra={
            'total_time': f"{total_time:.2f}s",
            'field_name': field_name,
            'match': match
        })

        return jsonify(fallback_result)

    except Exception as e:
        total_time = time.time() - request_start
        error_msg = f"💥 Erro na validação: {str(e)}"
        logger.error(error_msg, extra={
            'total_time': f"{total_time:.2f}s",
            'error_type': type(e).__name__
        }, exc_info=True)
        
        return jsonify({
            "match": False,
            "confidence": 0.0,
            "reasoning": f"Erro: {str(e)}",
            "processing_time": 0,
            "tokens": 0
        }), 500

if __name__ == '__main__':
    print("🚀 Starting DataHawk LLM Server...")
    print("📡 Endpoints:")
    print("   GET  /health - Health check")
    print("   POST /load   - Load model")
    print("   POST /generate - Generate response")
    print("   POST /completion - Llama.cpp compatible")
    print("   POST /validate - Validation-specific")
    print()

    # Auto-load model if it exists
    model_path = './models/llama3-8b-instruct.Q4_K_M.gguf'
    if Path(model_path).exists():
        print("🔄 Auto-loading model...")
        server.load_model(model_path)

    app.run(host='127.0.0.1', port=8000, debug=False)
