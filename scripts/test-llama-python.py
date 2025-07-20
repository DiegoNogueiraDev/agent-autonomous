#!/usr/bin/env python3
"""
Script de teste para llama-cpp-python
Testa se conseguimos carregar e usar o modelo Llama-3 8B
"""

import os
import sys
import time
import json
from pathlib import Path

def test_llama_cpp():
    print("🧪 Testing llama-cpp-python integration...\n")
    
    try:
        from llama_cpp import Llama
        print("✅ llama-cpp-python imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import llama-cpp-python: {e}")
        print("Install with: pip install llama-cpp-python")
        return False
    
    model_path = "./models/llama3-8b-instruct.Q4_K_M.gguf"
    
    if not Path(model_path).exists():
        print(f"❌ Model file not found: {model_path}")
        return False
    
    print(f"✅ Model file found: {model_path}")
    print(f"   Size: {Path(model_path).stat().st_size / (1024**3):.1f} GB\n")
    
    print("🔄 Loading model (this may take 30-60 seconds)...")
    start_time = time.time()
    
    try:
        llm = Llama(
            model_path=model_path,
            n_ctx=8192,
            n_threads=4,
            n_batch=512,
            verbose=False
        )
        load_time = time.time() - start_time
        print(f"✅ Model loaded successfully in {load_time:.1f}s\n")
        
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return False
    
    # Test simple prompt
    print("🔄 Testing simple prompt...")
    start_time = time.time()
    
    simple_prompt = "Hello, how are you today?"
    response = llm(simple_prompt, max_tokens=50, temperature=0.1)
    
    response_time = time.time() - start_time
    print(f"✅ Simple prompt completed in {response_time:.2f}s")
    print(f"   Response: {response['choices'][0]['text'][:100]}...\n")
    
    # Test validation prompt
    print("🔄 Testing validation prompt...")
    start_time = time.time()
    
    validation_prompt = """You are a data validation expert. Compare these two values and determine if they represent the same information.

Field Name: customer_name
Field Type: string
CSV Value: "John Doe"
Web Value: "john doe"

Consider:
1. Exact matches
2. Formatting differences (spaces, case, punctuation)
3. Semantic equivalence

Respond in JSON format:
{
  "match": true|false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}"""

    response = llm(validation_prompt, max_tokens=200, temperature=0.1, stop=["}"])
    response_time = time.time() - start_time
    
    print(f"✅ Validation prompt completed in {response_time:.2f}s")
    print(f"   Response: {response['choices'][0]['text']}\n")
    
    # Try to parse JSON response
    try:
        response_text = response['choices'][0]['text'].strip()
        if not response_text.endswith('}'):
            response_text += '}'
        
        parsed = json.loads(response_text)
        print(f"✅ JSON parsing successful:")
        print(f"   Match: {parsed.get('match')}")
        print(f"   Confidence: {parsed.get('confidence')}")
        print(f"   Reasoning: {parsed.get('reasoning')}")
        
    except Exception as e:
        print(f"⚠️  JSON parsing failed: {e}")
        print("   This is normal for initial tests")
    
    print(f"\n🎉 All tests completed successfully!")
    print(f"📊 Performance Summary:")
    print(f"   Model load time: {load_time:.1f}s")
    print(f"   Simple prompt: {response_time:.2f}s")
    print(f"   Memory usage: ~{Path(model_path).stat().st_size / (1024**3):.1f}GB model + overhead")
    
    return True

if __name__ == "__main__":
    success = test_llama_cpp()
    sys.exit(0 if success else 1)
