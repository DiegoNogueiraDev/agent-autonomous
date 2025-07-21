# 🛠️ DataHawk LLM Server - Guia de Solução de Problemas

## 🚨 Problema Identificado: Segmentation Fault

O servidor LLM está sendo fechado bruscamente com segmentation fault. Isso geralmente ocorre devido a:

1. **Memória insuficiente** para carregar o modelo de 4.58GB
2. **Arquivo de modelo corrompido** ou incompleto
3. **Configurações incompatíveis** do llama-cpp
4. **Conflitos de bibliotecas** Python

## ✅ Solução Implementada

### 1. Servidor Seguro (`llm-server-safe.py`)
Criamos uma versão mais robusta com:
- ✅ Verificação de memória antes de carregar
- ✅ Timeout de operações
- ✅ Tratamento de erros aprimorado
- ✅ Garbage collection automático
- ✅ Configurações conservadoras

### 2. Diagnóstico Automático (`diagnose-llm.py`)
Script para identificar problemas específicos.

## 🚀 Como Usar

### Opção 1: Servidor Seguro (Recomendado)
```bash
# Executar o servidor seguro
python3 llm-server-safe.py

# Em outro terminal, executar testes
python3 test-llm-server-safe.py
```

### Opção 2: Diagnóstico Completo
```bash
# Primeiro, instalar dependências
pip install psutil

# Executar diagnóstico
python3 diagnose-llm.py
```

### Opção 3: Verificação Manual
```bash
# Verificar tamanho do modelo
ls -lh models/llama3-8b-instruct.Q4_K_M.gguf

# Verificar memória disponível
free -h

# Verificar se é GGUF válido
hexdump -C models/llama3-8b-instruct.Q4_K_M.gguf | head -1
```

## 📋 Checklist de Verificação

### 1. Recursos do Sistema
- [ ] **RAM**: Mínimo 8GB (recomendado 12GB+)
- [ ] **Disco**: 6GB livres para o modelo
- [ ] **CPU**: 2+ cores disponíveis

### 2. Arquivo do Modelo
- [ ] **Tamanho**: 4.5GB+ (4,580,000,000 bytes)
- [ ] **Integridade**: Header GGUF válido
- [ ] **Permissões**: Leitura executável

### 3. Ambiente Python
- [ ] **Python**: 3.8+
- [ ] **llama-cpp-python**: Instalado
- [ ] **flask**: Instalado
- [ ] **psutil**: Instalado (opcional mas recomendado)

## 🔧 Instalação de Dependências

```bash
# Instalar pacotes necessários
pip install llama-cpp-python flask psutil

# Ou via requirements.txt
pip install -r requirements.txt
```

## 📝 Logs e Monitoramento

### Localização dos Logs
```
logs/
├── llm-server.log          # Log geral
├── llm-server-errors.log   # Apenas erros
└── llm-server-metrics.log  # Métricas de performance
```

### Monitoramento em Tempo Real
```bash
# Verificar logs em tempo real
tail -f logs/llm-server.log

# Verificar uso de memória
htop
```

## 🎯 Configurações de Segurança

### Limites Configurados
- **Context Size**: 4096 (reduzido de 8192)
- **Threads**: 2 (reduzido de 4)
- **Batch Size**: 256 (reduzido de 512)
- **Timeout**: 60 segundos para carregamento
- **Memory Check**: 6GB mínimo

### Parâmetros Ajustáveis
Edite `src/llm_server/core/model_manager_safe.py`:
```python
# Ajustar conforme necessário
max_memory_usage_gb = 6.0    # Reduzir se memória for limitada
max_context_size = 4096      # Reduzir para estabilidade
max_batch_size = 256         # Reduzir para memória
```

## 🚨 Erros Comuns e Soluções

### Erro: "Out of Memory"
```bash
# Solução: Reduzir parâmetros
# Editar model_manager_safe.py
max_context_size = 2048
max_batch_size = 128
```

### Erro: "Model file not found"
```bash
# Solução: Verificar caminho
ls -la models/
# Ou especificar caminho completo
python3 llm-server-safe.py --model-path /caminho/completo/modelo.gguf
```

### Erro: "Segmentation fault"
```bash
# Solução: Usar servidor seguro
python3 llm-server-safe.py
# Se persistir, verificar integridade do modelo
python3 diagnose-llm.py
```

## 📊 Testes de Performance

### Teste de Carga
```bash
# Executar testes automatizados
python3 test-llm-server-safe.py
```

### Teste Manual com curl
```bash
# Health check
curl http://localhost:8000/health

# Validar dados
curl -X POST http://localhost:8000/validate \
  -H "Content-Type: application/json" \
  -d '{"csv_value":"John","web_value":"John","field_type":"name"}'
```

## 🔄 Reinicialização Automática

### Systemd Service (Linux)
Crie `/etc/systemd/system/datahawk-llm.service`:
```ini
[Unit]
Description=DataHawk LLM Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/project
ExecStart=/usr/bin/python3 llm-server-safe.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Docker (Opcional)
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
EXPOSE 8000
CMD ["python3", "llm-server-safe.py"]
```

## 📞 Suporte

Se os problemas persistirem:
1. Execute `python3 diagnose-llm.py` e envie o output
2. Verifique os logs em `logs/llm-server.log`
3. Teste com um modelo menor primeiro
4. Considere usar CPU com mais memória

## 🎉 Sucesso!

Após aplicar estas soluções, o servidor LLM deve:
- ✅ Iniciar sem segmentation fault
- ✅ Carregar o modelo de forma segura
- ✅ Responder aos health checks
- ✅ Processar requisições de validação
- ✅ Manter logs detalhados para debugging
