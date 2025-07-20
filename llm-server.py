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
from pathlib import Path
from flask import Flask, request, jsonify
from llama_cpp import Llama

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
            return True

        print(f"🔄 Loading model from {model_path}...")
        start_time = time.time()

        try:
            self.llm = Llama(
                model_path=model_path,
                n_ctx=8192,
                n_threads=4,
                n_batch=512,
                verbose=False
            )

            self.load_time = time.time() - start_time
            self.model_loaded = True
            print(f"✅ Model loaded successfully in {self.load_time:.1f}s")
            return True

        except Exception as e:
            print(f"❌ Failed to load model: {e}")
            return False

    def generate(self, prompt: str, max_tokens: int = 1024, temperature: float = 0.1):
        """Generate response from the model"""
        if not self.model_loaded:
            raise RuntimeError("Model not loaded")

        self.request_count += 1
        start_time = time.time()

        try:
            response = self.llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=["\n\n", "}", "END"],
                echo=False
            )

            processing_time = time.time() - start_time

            return {
                "text": response['choices'][0]['text'].strip(),
                "tokens": response['usage']['completion_tokens'],
                "processing_time": processing_time,
                "model": "llama3-8b-instruct"
            }

        except Exception as e:
            print(f"❌ Generation failed: {e}")
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
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model_loaded": server.model_loaded,
        "load_time": server.load_time,
        "request_count": server.request_count
    })

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
    try:
        data = request.get_json()
        csv_value = str(data.get('csv_value', ''))
        web_value = str(data.get('web_value', ''))
        field_type = str(data.get('field_type', 'string'))
        field_name = str(data.get('field_name', 'field'))

        # Handle special characters and encoding
        csv_value = csv_value.encode('utf-8').decode('utf-8')
        web_value = web_value.encode('utf-8').decode('utf-8')

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

        result = server.generate(prompt, max_tokens=150, temperature=0.1)

        # Clean and parse response
        response_text = result['text'].strip()

        # Remove any markdown formatting
        response_text = re.sub(r'```json\s*', '', response_text)
        response_text = re.sub(r'\s*```', '', response_text)
        response_text = response_text.strip()

        # Try to extract JSON
        json_data = server.extract_json_from_text(response_text)

        if json_data and all(key in json_data for key in ['match', 'confidence', 'reasoning']):
            # Ensure correct types
            return jsonify({
                "match": bool(json_data.get('match', False)),
                "confidence": float(min(max(json_data.get('confidence', 0.5), 0.0), 1.0)),
                "reasoning": str(json_data.get('reasoning', 'Validation completed')),
                "processing_time": result['processing_time'],
                "tokens": result['tokens']
            })

        # Fallback with structured parsing
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

        return jsonify({
            "match": match,
            "confidence": confidence,
            "reasoning": "Fallback string comparison",
            "processing_time": result['processing_time'],
            "tokens": result['tokens']
        })

    except Exception as e:
        return jsonify({
            "match": False,
            "confidence": 0.0,
            "reasoning": f"Error: {str(e)}",
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
