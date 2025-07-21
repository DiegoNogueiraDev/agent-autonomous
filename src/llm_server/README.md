# DataHawk LLM Server - Versão Modular

## 📁 Estrutura do Projeto

```
src/llm_server/
├── __init__.py          # Pacote principal
├── main.py             # Ponto de entrada
├── logs/               # Sistema de logging
│   ├── __init__.py
│   └── logger.py       # Configuração de logs
├── core/               # Funcionalidade principal
│   ├── __init__.py
│   ├── health_monitor.py  # Monitoramento de saúde
│   └── model_manager.py   # Gerenciamento do modelo
├── models/             # Modelos de dados
│   ├── __init__.py
│   └── responses.py    # Estruturas de resposta
├── api/                # Endpoints HTTP
│   ├── __init__.py
│   └── routes.py       # Rotas Flask
├── utils/              # Utilitários
│   ├── __init__.py
│   ├── formatters.py   # Funções de formatação
│   └── signals.py      # Handlers de sinais
└── README.md          # Este arquivo
```

## 🚀 Como Executar

### Opção 1: Usando o script modular
```bash
python llm-server-modular.py
```

### Opção 2: Usando o módulo diretamente
```bash
python -m llm_server.main
```

### Opção 3: Instalando como pacote
```bash
pip install -e .
python -c "from llm_server.main import main; main()"
```

## 📡 Endpoints Disponíveis

- **GET /health** - Verificação de saúde do servidor
- **POST /load** - Carregar modelo
- **POST /generate** - Gerar resposta (compatível llama.cpp)
- **POST /completion** - Completion (compatível llama.cpp)
- **POST /validate** - Validação específica de dados

## 🧪 Exemplos de Uso

### Health Check
```bash
curl http://localhost:8000/health
```

### Carregar Modelo
```bash
curl -X POST http://localhost:8000/load \
  -H "Content-Type: application/json" \
  -d '{"model_path": "./models/llama3-8b-instruct.Q4_K_M.gguf"}'
```

### Gerar Resposta
```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Qual é a capital do Brasil?", "max_tokens": 100}'
```

### Validar Dados
```bash
curl -X POST http://localhost:8000/validate \
  -H "Content-Type: application/json" \
  -d '{
    "csv_value": "São Paulo",
    "web_value": "Sao Paulo",
    "field_type": "string",
    "field_name": "cidade"
  }'
```

## 📊 Logs

Os logs são salvos em:
- `logs/llm-server.log` - Log geral
- `logs/llm-server-errors.log` - Apenas erros
- `logs/llm-server-metrics.log` - Métricas de performance

## 🏗️ Arquitetura

### Princípios de Design
- **Single Responsibility**: Cada módulo tem uma responsabilidade única
- **Clean Architecture**: Separação clara entre camadas
- **Dependency Injection**: Facilita testes e manutenção
- **Logging Centralizado**: Sistema robusto de logs

### Camadas
1. **API Layer** (`api/`): Endpoints HTTP e validação de entrada
2. **Core Layer** (`core/`): Lógica de negócio principal
3. **Models Layer** (`models/`): Estruturas de dados
4. **Utils Layer** (`utils/`): Funções auxiliares
5. **Logs Layer** (`logs/`): Sistema de logging

## 🔧 Configuração

### Variáveis de Ambiente
- `LLM_MODEL_PATH`: Caminho do modelo (padrão: ./models/llama3-8b-instruct.Q4_K_M.gguf)
- `LLM_HOST`: Host do servidor (padrão: 127.0.0.1)
- `LLM_PORT`: Porta do servidor (padrão: 8000)

### Parâmetros do Modelo
- `n_ctx`: Tamanho do contexto (adaptativo baseado no tamanho do modelo)
- `n_threads`: Número de threads (CPU count ou 4)
- `n_batch`: Tamanho do batch (512)
- `temperature`: Temperatura padrão (0.1)

## 🧪 Testes

Para executar testes básicos:
```bash
# Testar health check
curl http://localhost:8000/health

# Testar com modelo carregado
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello"}'
```

## 🔄 Migração da Versão Original

A versão modular mantém 100% de compatibilidade com a API original. Todos os endpoints e formatos de resposta são idênticos.

### Diferenças Principais
- Código dividido em módulos coesos
- Melhor organização e manutenibilidade
- Sistema de logging mais robusto
- Facilita testes unitários
- Preparação para futuras extensões
