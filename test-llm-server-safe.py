#!/usr/bin/env python3
"""
Script de teste para o servidor LLM seguro
"""

import requests
import json
import time
from pathlib import Path

BASE_URL = "http://localhost:8000"

def test_health_check():
    """Testa o endpoint de health check."""
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"✅ Health check: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Status: {data.get('status')}")
            print(f"   Model loaded: {data.get('model_loaded')}")
            return True
        return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_load_model():
    """Testa o carregamento do modelo."""
    try:
        model_path = "./models/llama3-8b-instruct.Q4_K_M.gguf"
        if not Path(model_path).exists():
            print(f"⚠️ Model file not found: {model_path}")
            return False

        payload = {"model_path": model_path}
        response = requests.post(f"{BASE_URL}/load", json=payload)
        print(f"✅ Load model: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Status: {data.get('status')}")
            print(f"   Load time: {data.get('load_time')}s")
            return True
        else:
            print(f"   Error: {response.text}")
        return False
    except Exception as e:
        print(f"❌ Load model failed: {e}")
        return False

def test_generate():
    """Testa geração de texto."""
    try:
        payload = {
            "prompt": "What is the capital of Brazil?",
            "max_tokens": 50,
            "temperature": 0.1
        }
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        print(f"✅ Generate: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data.get('content', '')[:100]}...")
            print(f"   Tokens: {data.get('tokens_predicted')}")
            return True
        else:
            print(f"   Error: {response.text}")
        return False
    except Exception as e:
        print(f"❌ Generate failed: {e}")
        return False

def test_validate():
    """Testa validação de dados."""
    try:
        payload = {
            "csv_value": "John Doe",
            "web_value": "John Doe",
            "field_type": "name",
            "field_name": "full_name"
        }
        response = requests.post(f"{BASE_URL}/validate", json=payload)
        print(f"✅ Validate: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Match: {data.get('match')}")
            print(f"   Confidence: {data.get('confidence')}")
            print(f"   Reasoning: {data.get('reasoning')}")
            return True
        else:
            print(f"   Error: {response.text}")
        return False
    except Exception as e:
        print(f"❌ Validate failed: {e}")
        return False

def main():
    """Executa todos os testes."""
    print("🧪 Iniciando testes do servidor LLM seguro...")
    print("=" * 50)

    # Aguardar servidor iniciar
    print("⏳ Aguardando servidor iniciar...")
    time.sleep(2)

    tests = [
        ("Health Check", test_health_check),
        ("Load Model", test_load_model),
        ("Generate", test_generate),
        ("Validate", test_validate),
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Testando: {test_name}")
        result = test_func()
        results.append((test_name, result))
        time.sleep(1)  # Delay entre testes

    print("\n" + "=" * 50)
    print("📊 Resultados dos testes:")
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {test_name}: {status}")

    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\n🎯 Total: {passed}/{total} testes passaram")

    if passed == total:
        print("🎉 Todos os testes passaram!")
    else:
        print("⚠️ Alguns testes falharam. Verifique os logs.")

if __name__ == '__main__':
    main()
