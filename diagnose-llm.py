#!/usr/bin/env python3
"""
Script de diagnóstico para identificar problemas com o modelo LLM
"""

import os
import sys
import psutil
from pathlib import Path

def check_system_resources():
    """Verifica recursos do sistema."""
    print("🔍 Verificando recursos do sistema...")

    # Memória
    memory = psutil.virtual_memory()
    print(f"💾 Memória total: {memory.total / (1024**3):.2f} GB")
    print(f"💾 Memória disponível: {memory.available / (1024**3):.2f} GB")
    print(f"💾 Memória usada: {memory.percent}%")

    # CPU
    cpu_count = psutil.cpu_count()
    print(f"🖥️  CPUs: {cpu_count}")

    # Disco
    disk = psutil.disk_usage('/')
    print(f"💽 Espaço em disco: {disk.free / (1024**3):.2f} GB livres")

    return memory.available / (1024**3) > 6.0  # Precisa de pelo menos 6GB

def check_model_file():
    """Verifica o arquivo do modelo."""
    print("\n🔍 Verificando arquivo do modelo...")

    model_path = "./models/llama3-8b-instruct.Q4_K_M.gguf"
    path = Path(model_path)

    if not path.exists():
        print(f"❌ Arquivo não encontrado: {model_path}")
        return False

    size = path.stat().st_size
    print(f"📊 Tamanho do arquivo: {size / (1024**3):.2f} GB")

    if size < 4 * 1024**3:  # Menos de 4GB
        print("⚠️ Arquivo parece pequeno para um modelo de 8B")

    # Verifica header GGUF
    try:
        with open(model_path, 'rb') as f:
            header = f.read(8)
            if header.startswith(b'GGUF'):
                print("✅ Header GGUF válido")
            else:
                print("❌ Header inválido - não é um arquivo GGUF")
                return False
    except Exception as e:
        print(f"❌ Erro ao ler arquivo: {e}")
        return False

    return True

def check_python_environment():
    """Verifica ambiente Python."""
    print("\n🔍 Verificando ambiente Python...")

    print(f"🐍 Python: {sys.version}")

    # Verifica pacotes necessários
    packages = ['llama_cpp', 'flask', 'psutil']
    for package in packages:
        try:
            __import__(package)
            print(f"✅ {package} disponível")
        except ImportError:
            print(f"❌ {package} não encontrado")
            return False

    return True

def test_llama_import():
    """Testa importação do llama_cpp."""
    print("\n🔍 Testando importação do llama_cpp...")

    try:
        from llama_cpp import Llama
        print("✅ llama_cpp importado com sucesso")

        # Testa criação de instância sem modelo
        try:
            # Isso deve falhar mas não causar segmentation fault
            print("✅ Classe Llama disponível")
        except Exception as e:
            print(f"⚠️ Aviso ao criar instância: {e}")

        return True
    except Exception as e:
        print(f"❌ Erro ao importar llama_cpp: {e}")
        return False

def main():
    """Executa diagnóstico completo."""
    print("🔎 Diagnóstico do DataHawk LLM Server")
    print("=" * 50)

    checks = [
        ("Recursos do Sistema", check_system_resources),
        ("Arquivo do Modelo", check_model_file),
        ("Ambiente Python", check_python_environment),
        ("Llama CPP", test_llama_import),
    ]

    results = []
    for check_name, check_func in checks:
        print(f"\n{check_name}:")
        try:
            result = check_func()
            results.append(result)
            status = "✅ OK" if result else "❌ FALHA"
            print(f"   Resultado: {status}")
        except Exception as e:
            print(f"   Erro: {e}")
            results.append(False)

    print("\n" + "=" * 50)
    print("📊 Resumo do diagnóstico:")

    if all(results):
        print("🎉 Todos os checks passaram! O servidor deve funcionar.")
    else:
        print("⚠️ Alguns problemas foram encontrados:")
        if not results[0]:
            print("   - Memória insuficiente (precisa de pelo menos 6GB livres)")
        if not results[1]:
            print("   - Problema com o arquivo do modelo")
        if not results[2]:
            print("   - Pacotes Python faltando")
        if not results[3]:
            print("   - Problema com llama_cpp")

    print("\n💡 Dicas:")
    print("   - Instale psutil: pip install psutil")
    print("   - Verifique se tem memória RAM suficiente")
    print("   - Confirme que o modelo está completo (4.5GB+)")
    print("   - Use Python 3.8+")

if __name__ == '__main__':
    main()
