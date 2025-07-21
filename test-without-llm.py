#!/usr/bin/env python3
"""
Script de teste para DataHawk sem dependência do LLM
Simula servidor LLM para testar resto da funcionalidade
"""

import json
import time
from flask import Flask, request, jsonify
from threading import Thread
import requests

# Servidor mock para simular LLM
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': True,
        'timestamp': time.time(),
        'memory_usage': '50.0%',
        'mock': True
    }), 200

@app.route('/validate', methods=['POST'])
def validate():
    """Simula validação LLM com lógica simples"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'error': 'JSON inválido',
                'match': False,
                'confidence': 0.0
            }), 400

        csv_value = str(data.get('csv_value', '')).lower().strip()
        web_value = str(data.get('web_value', '')).lower().strip()
        field_type = data.get('field_type', 'text')

        # Lógica simples de validação
        if field_type == 'email':
            # Para emails, verifica se são exatamente iguais
            match = csv_value == web_value
            confidence = 0.95 if match else 0.1
        elif field_type == 'number':
            # Para números, tenta converter e comparar
            try:
                csv_num = float(csv_value)
                web_num = float(web_value)
                match = abs(csv_num - web_num) < 0.001
                confidence = 0.95 if match else 0.1
            except:
                match = csv_value == web_value
                confidence = 0.8 if match else 0.2
        else:
            # Para texto, verifica similaridade básica
            if csv_value == web_value:
                match = True
                confidence = 0.95
            elif csv_value in web_value or web_value in csv_value:
                match = True
                confidence = 0.8
            elif len(csv_value) > 3 and len(web_value) > 3:
                # Verifica palavras em comum
                csv_words = set(csv_value.split())
                web_words = set(web_value.split())
                common = csv_words.intersection(web_words)
                if common:
                    match = True
                    confidence = 0.7
                else:
                    match = False
                    confidence = 0.2
            else:
                match = False
                confidence = 0.1

        return jsonify({
            'match': match,
            'confidence': confidence,
            'reasoning': f"Mock LLM: {'MATCH' if match else 'NO MATCH'} (confidence: {confidence})",
            'csv_value': csv_value,
            'web_value': web_value,
            'mock': True
        }), 200

    except Exception as e:
        return jsonify({
            'error': f'Erro interno: {str(e)}',
            'match': False,
            'confidence': 0.0,
            'mock': True
        }), 500

def start_mock_server():
    """Inicia servidor mock em background"""
    print("🔄 Iniciando servidor LLM Mock na porta 8000...")
    app.run(host='127.0.0.1', port=8000, debug=False, use_reloader=False)

if __name__ == '__main__':
    # Inicia servidor mock
    server_thread = Thread(target=start_mock_server, daemon=True)
    server_thread.start()

    print("⏰ Aguardando servidor inicializar...")
    time.sleep(2)

    # Testa servidor mock
    try:
        response = requests.get('http://localhost:8000/health')
        if response.status_code == 200:
            print("✅ Servidor LLM Mock funcionando!")
            print(f"Status: {response.json()}")

            # Teste de validação
            test_data = {
                'csv_value': 'John Doe',
                'web_value': 'John Doe',
                'field_type': 'text'
            }

            val_response = requests.post('http://localhost:8000/validate', json=test_data)
            if val_response.status_code == 200:
                print("✅ Validação funcionando!")
                print(f"Resultado: {val_response.json()}")
            else:
                print(f"❌ Erro na validação: {val_response.status_code}")
        else:
            print(f"❌ Erro no health check: {response.status_code}")
    except Exception as e:
        print(f"❌ Erro testando servidor: {e}")

    print("\n🚀 Servidor LLM Mock rodando. Pressione Ctrl+C para parar.")
    print("💡 Agora você pode executar os testes do DataHawk!")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Parando servidor mock...")
