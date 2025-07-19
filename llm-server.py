#!/usr/bin/env python3
"""
DataHawk LLM Server
Servidor Python que expõe o modelo Llama-3 8B via HTTP para o Node.js
"""

import os
import sys
import json
import time
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
    """Generate response endpoint"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        max_tokens = data.get('max_tokens', 1024)
        temperature = data.get('temperature', 0.1)
        
        if not prompt:
            return jsonify({"error": "Prompt required"}), 400
        
        result = server.generate(prompt, max_tokens, temperature)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/validate', methods=['POST'])
def validate():
    """Validation-specific endpoint with optimized prompts"""
    try:
        data = request.get_json()
        csv_value = data.get('csv_value', '')
        web_value = data.get('web_value', '')
        field_type = data.get('field_type', 'string')
        field_name = data.get('field_name', 'field')
        
        # Optimized prompt for Llama-3
        prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a data validation expert. Compare two values and determine if they represent the same information.

Be precise and respond ONLY with valid JSON in this exact format:
{{"match": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}}

Consider:
- Exact matches: same text = high confidence match
- Case differences: "John" vs "john" = match
- Formatting: "$123.45" vs "123.45" = match for currency
- Semantic equivalence: "John Doe" vs "Doe, John" = match
- Date formats: "2025-07-19" vs "July 19, 2025" = match

<|eot_id|><|start_header_id|>user<|end_header_id|>
Field: {field_name} (type: {field_type})
CSV Value: "{csv_value}"
Web Value: "{web_value}"

Compare these values:<|eot_id|><|start_header_id|>assistant<|end_header_id|>"""

        result = server.generate(prompt, max_tokens=200, temperature=0.1)
        
        # Try to parse JSON from response
        response_text = result['text'].strip()
        
        # Clean up the response to extract JSON
        if response_text.startswith('{') and '}' in response_text:
            json_end = response_text.find('}') + 1
            response_text = response_text[:json_end]
        
        try:
            validation_result = json.loads(response_text)
            validation_result['processing_time'] = result['processing_time']
            validation_result['tokens'] = result['tokens']
            return jsonify(validation_result)
            
        except json.JSONDecodeError:
            # Fallback parsing
            match = 'true' in response_text.lower() and 'match' in response_text.lower()
            confidence = 0.5  # Default confidence
            
            return jsonify({
                "match": match,
                "confidence": confidence,
                "reasoning": "Fallback parsing - LLM response not in expected format",
                "raw_response": response_text,
                "processing_time": result['processing_time'],
                "tokens": result['tokens']
            })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 Starting DataHawk LLM Server...")
    print("📡 Endpoints:")
    print("   GET  /health - Health check")
    print("   POST /load   - Load model")
    print("   POST /generate - Generate response")
    print("   POST /validate - Validation-specific endpoint")
    print()
    
    # Auto-load model if it exists
    model_path = './models/llama3-8b-instruct.Q4_K_M.gguf'
    if Path(model_path).exists():
        print("🔄 Auto-loading model...")
        server.load_model(model_path)
    
    app.run(host='127.0.0.1', port=8000, debug=False)
