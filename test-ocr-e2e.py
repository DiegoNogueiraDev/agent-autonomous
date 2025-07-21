#!/usr/bin/env python3
"""
Teste E2E para validar a integração entre Python OCR Service e TypeScript
Este script testa o fluxo completo de OCR com Python
"""

import os
import sys
import time
import json
import base64
import requests
import subprocess
from pathlib import Path

# Configurações
PYTHON_OCR_URL = "http://localhost:5000"
LLM_SERVER_URL = "http://localhost:8000"
TEST_TIMEOUT = 30  # segundos

class E2ETestRunner:
    def __init__(self):
        self.python_process = None
        self.llm_process = None
        self.test_results = {
            "python_ocr_service": False,
            "llm_server": False,
            "integration": False,
            "ocr_accuracy": False,
            "logs": []
        }

    def log(self, message, level="INFO"):
        """Adiciona log ao resultado"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}"
        print(log_entry)
        self.test_results["logs"].append(log_entry)

    def start_python_ocr_service(self):
        """Inicia o serviço Python OCR"""
        self.log("Iniciando Python OCR Service...")
        try:
            # Verificar se o serviço já está rodando
            try:
                response = requests.get(f"{PYTHON_OCR_URL}/health", timeout=5)
                if response.status_code == 200:
                    self.log("Python OCR Service já está rodando")
                    self.test_results["python_ocr_service"] = True
                    return True
            except:
                pass

            # Iniciar o serviço
            cmd = [
                sys.executable,
                "src/ocr/python-ocr-service.py",
                "--host", "0.0.0.0",
                "--port", "5000"
            ]

            self.python_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=Path(__file__).parent
            )

            # Aguardar inicialização
            for i in range(TEST_TIMEOUT):
                try:
                    response = requests.get(f"{PYTHON_OCR_URL}/health", timeout=5)
                    if response.status_code == 200:
                        self.log("Python OCR Service iniciado com sucesso")
                        self.test_results["python_ocr_service"] = True
                        return True
                except:
                    time.sleep(1)

            self.log("Falha ao iniciar Python OCR Service", "ERROR")
            return False

        except Exception as e:
            self.log(f"Erro ao iniciar Python OCR: {str(e)}", "ERROR")
            return False

    def start_llm_server(self):
        """Inicia o LLM Server"""
        self.log("Iniciando LLM Server...")
        try:
            # Verificar se o serviço já está rodando
            try:
                response = requests.get(f"{LLM_SERVER_URL}/health", timeout=5)
                if response.status_code == 200:
                    self.log("LLM Server já está rodando")
                    self.test_results["llm_server"] = True
                    return True
            except:
                pass

            # Iniciar o serviço
            cmd = [
                sys.executable,
                "llm-server-safe.py"
            ]

            self.llm_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=Path(__file__).parent
            )

            # Aguardar inicialização
            for i in range(TEST_TIMEOUT):
                try:
                    response = requests.get(f"{LLM_SERVER_URL}/health", timeout=5)
                    if response.status_code == 200:
                        self.log("LLM Server iniciado com sucesso")
                        self.test_results["llm_server"] = True
                        return True
                except:
                    time.sleep(1)

            self.log("Falha ao iniciar LLM Server", "ERROR")
            return False

        except Exception as e:
            self.log(f"Erro ao iniciar LLM Server: {str(e)}", "ERROR")
            return False

    def test_ocr_service(self):
        """Testa o serviço OCR Python"""
        self.log("Testando serviço OCR Python...")

        try:
            # Testar health check
            response = requests.get(f"{PYTHON_OCR_URL}/health")
            if response.status_code != 200:
                self.log("Health check falhou", "ERROR")
                return False

            # Testar extração de texto com imagem simples
            # Criar uma imagem de teste simples
            from PIL import Image, ImageDraw, ImageFont
            import io

            # Criar imagem com texto
            img = Image.new('RGB', (200, 50), color='white')
            draw = ImageDraw.Draw(img)
            draw.text((10, 10), "TESTE OCR", fill='black')

            # Converter para base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            img_base64 = base64.b64encode(buffer.getvalue()).decode()

            # Testar OCR
            payload = {
                "image": f"data:image/png;base64,{img_base64}",
                "options": {
                    "language": "eng+por",
                    "psm": 6
                }
            }

            response = requests.post(f"{PYTHON_OCR_URL}/extract", json=payload, timeout=10)
            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "").strip()
                confidence = result.get("confidence", 0)

                self.log(f"OCR Resultado: '{text}' (confiança: {confidence})")

                if "TESTE" in text.upper() and confidence > 0.5:
                    self.log("Teste OCR Python: SUCESSO")
                    self.test_results["ocr_accuracy"] = True
                    return True
                else:
                    self.log("Teste OCR Python: BAIXA CONFIANÇA", "WARNING")
                    return False
            else:
                self.log(f"Erro no OCR: {response.status_code}", "ERROR")
                return False

        except Exception as e:
            self.log(f"Erro no teste OCR: {str(e)}", "ERROR")
            return False

    def test_integration(self):
        """Testa a integração entre os serviços"""
        self.log("Testando integração entre serviços...")

        try:
            # Testar comunicação entre serviços
            # Simular uma chamada do TypeScript para Python OCR

            # Criar cliente Python OCR
            from src.ocr.python_ocr_client import PythonOCRClient

            client = PythonOCRClient({
                "pythonServiceUrl": PYTHON_OCR_URL,
                "timeout": 10000
            })

            # Inicializar cliente
            client.initialize()

            # Testar extração
            from PIL import Image, ImageDraw
            import io

            img = Image.new('RGB', (100, 30), color='white')
            draw = ImageDraw.Draw(img)
            draw.text((10, 5), "INTEGRATION", fill='black')

            buffer = io.BytesIO()
            img.save(buffer, format='PNG')

            result = client.extractText(buffer.getvalue())

            if result and "INTEGRATION" in result.text.upper():
                self.log("Teste de integração: SUCESSO")
                self.test_results["integration"] = True
                return True
            else:
                self.log("Teste de integração: FALHOU", "ERROR")
                return False

        except Exception as e:
            self.log(f"Erro no teste de integração: {str(e)}", "ERROR")
            return False

    def check_logs(self):
        """Verifica logs dos serviços"""
        self.log("Verificando logs dos serviços...")

        try:
            # Verificar logs do Python OCR
            if self.python_process:
                stdout, stderr = self.python_process.communicate(timeout=2)
                if stdout:
                    self.log(f"Python OCR STDOUT: {stdout.decode()[:500]}")
                if stderr:
                    self.log(f"Python OCR STDERR: {stderr.decode()[:500]}")

            # Verificar logs do LLM Server
            if self.llm_process:
                stdout, stderr = self.llm_process.communicate(timeout=2)
                if stdout:
                    self.log(f"LLM Server STDOUT: {stdout.decode()[:500]}")
                if stderr:
                    self.log(f"LLM Server STDERR: {stderr.decode()[:500]}")

        except Exception as e:
            self.log(f"Erro ao verificar logs: {str(e)}", "WARNING")

    def run_all_tests(self):
        """Executa todos os testes E2E"""
        self.log("🦅 DataHawks - Teste E2E OCR Python")
        self.log("=" * 50)

        try:
            # Testar serviços
            python_ok = self.start_python_ocr_service()
            llm_ok = self.start_llm_server()

            if python_ok:
                ocr_ok = self.test_ocr_service()
            else:
                ocr_ok = False

            integration_ok = self.test_integration()

            # Verificar logs
            self.check_logs()

            # Resultado final
            self.log("=" * 50)
            self.log("RESULTADO DO TESTE E2E:")
            self.log(f"Python OCR Service: {'✅' if self.test_results['python_ocr_service'] else '❌'}")
            self.log(f"LLM Server: {'✅' if self.test_results['llm_server'] else '❌'}")
            self.log(f"OCR Accuracy: {'✅' if self.test_results['ocr_accuracy'] else '❌'}")
            self.log(f"Integration: {'✅' if self.test_results['integration'] else '❌'}")

            # Salvar resultado
            with open("test-ocr-e2e-result.json", "w") as f:
                json.dump(self.test_results, f, indent=2)

            return all([
                self.test_results["python_ocr_service"],
                self.test_results["llm_server"],
                self.test_results["ocr_accuracy"],
                self.test_results["integration"]
            ])

        except Exception as e:
            self.log(f"Erro crítico no teste E2E: {str(e)}", "ERROR")
            return False

        finally:
            # Limpar processos
            if self.python_process:
                self.python_process.terminate()
            if self.llm_process:
                self.llm_process.terminate()

if __name__ == "__main__":
    runner = E2ETestRunner()
    success = runner.run_all_tests()

    if success:
        print("\n🎉 Todos os testes E2E passaram!")
        sys.exit(0)
    else:
        print("\n❌ Alguns testes falharam. Verifique os logs.")
        sys.exit(1)
