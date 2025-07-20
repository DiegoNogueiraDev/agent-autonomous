# 🧪 Plano de Testes Funcionais - DataHawk QA

**Data:** 19/07/2025  
**Analista:** QA Autônomo  
**Status:** Pronto para Execução

## 📋 Lista de Testes Funcionais

### Teste 1: Validação de Configuração
**Objetivo:** Verificar se o sistema valida corretamente arquivos de configuração

**Comando:**
```bash
node dist/main.js config --validate --path config/sample-validation.yaml
```

**Critérios de Aceitação:**
- ✅ Deve retornar "Configuration is valid" se o YAML estiver correto
- ❌ Deve retornar erro específico se houver problemas no YAML
- ⚠️ Deve alertar sobre campos CSV não mapeados

### Teste 2: Status do Sistema
**Objetivo:** Verificar dependências e estado do sistema

**Comando:**
```bash
node dist/main.js status --models --deps
```

**Critérios de Aceitação:**
- ✅ Node.js deve estar na versão 18+
- ❌ Python deve estar disponível (atualmente falhando)
- ⚠️ Modelos LLM devem ser verificados
- ⚠️ Dependências devem ser listadas

### Teste 3: Validação com Dry Run
**Objetivo:** Testar configuração sem processar dados reais

**Comando:**
```bash
node dist/main.js validate \
  --input data/input/sample.csv \
  --config config/sample-validation.yaml \
  --dry-run
```

**Critérios de Aceitação:**
- ✅ Deve validar configuração sem erros
- ⚠️ Deve alertar sobre campos não mapeados
- ✅ Deve retornar "Dry run completed"

### Teste 4: Validação Completa (Bloqueado)
**Objetivo:** Executar validação completa com dados de exemplo

**Comando:**
```bash
node dist/main.js validate \
  --input data/input/sample.csv \
  --config config/sample-validation.yaml \
  --output test-output-qa \
  --format json,html \
  --verbose
```

**Bloqueado por:**
- [ ] Python não disponível
- [ ] URL de destino não funcional
- [ ] Campos CSV não mapeados

### Teste 5: Geração de Configuração
**Objetivo:** Testar geração de configuração de exemplo

**Comando:**
```bash
node dist/main.js config --generate
```

**Critérios de Aceitação:**
- ✅ Deve criar arquivo config/sample-validation.yaml
- ✅ Deve conter estrutura YAML válida
- ⚠️ Deve refletir estrutura do CSV de exemplo

## 🔧 Ambiente de Teste Necessário

### Pré-requisitos
```bash
# 1. Python 3.8+
python3 --version  # Deve retornar 3.8+

# 2. Dependências Python
pip install -r requirements.txt

# 3. Browsers Playwright
npx playwright install

# 4. Modelos LLM (opcional para testes básicos)
# mkdir -p models
# wget -O models/mistral-7b-instruct-q4_k_m.gguf [URL_DO_MODELO]
```

### Configuração de Teste
```bash
# Criar página de teste local
cat > test-page.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>DataHawk Test Page</title>
</head>
<body>
    <h1>John Doe</h1>
    <p>john@example.com</p>
    <div>Age: 30</div>
    <span>Status: active</span>
</body>
</html>
EOF

# Atualizar configuração para usar página local
# Editar config/sample-validation.yaml
```

## 📊 Casos de Teste Detalhados

### CT-001: Validação de Campos Obrigatórios
**Dados de Entrada:**
```csv
id,name,email,age,status
1,John Doe,john@example.com,30,active
```

**Configuração Esperada:**
```yaml
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "text"
    required: true
  - csvField: "email"
    webSelector: "p"
    fieldType: "text"
    required: true
  - csvField: "age"
    webSelector: "div"
    fieldType: "number"
    required: false
  - csvField: "status"
    webSelector: "span"
    fieldType: "text"
    required: false
```

**Resultado Esperado:**
- ✅ Todos os campos mapeados
- ✅ Validação bem-sucedida
- ✅ Relatório com 100% de cobertura

### CT-002: Validação com Campos Faltando
**Dados de Entrada:**
```csv
id,name,email,age,status
1,John Doe,john@example.com,30,active
```

**Configuração (campos faltando):**
```yaml
fieldMappings:
  - csvField: "name"
    webSelector: "h1"
    fieldType: "text"
    required: true
```

**Resultado Esperado:**
- ⚠️ Alerta sobre campos não mapeados
- ⚠️ Validação parcial
- ✅ Relatório indica campos não verificados

### CT-003: Validação com Erros de Extração
**Dados de Entrada:**
```csv
id,name,email,age,status
1,John Doe,john@example.com,30,active
```

**Configuração (seletores inválidos):**
```yaml
fieldMappings:
  - csvField: "name"
    webSelector: "#nonexistent"
    fieldType: "text"
    required: true
```

**Resultado Esperado:**
- ❌ Falha na extração
- ✅ Captura de evidências
- ✅ Relatório com erros detalhados

## 🎯 Checklist de Testes

### Testes de Configuração
- [ ] Validar estrutura YAML
- [ ] Verificar campos obrigatórios
- [ ] Testar valores padrão
- [ ] Validar tipos de dados

### Testes de CSV
- [ ] Carregar arquivo CSV válido
- [ ] Tratar CSV com delimitadores diferentes
- [ ] Validar encoding UTF-8
- [ ] Tratar campos vazios/nulos

### Testes de Browser
- [ ] Inicializar browser
- [ ] Navegar para URL
- [ ] Extrair dados via DOM
- [ ] Capturar screenshots
- [ ] Fallback para OCR

### Testes de Relatório
- [ ] Gerar JSON
- [ ] Gerar HTML
- [ ] Incluir evidências
- [ ] Calcular métricas corretamente

### Testes de Performance
- [ ] Processar 1 registro
- [ ] Processar 10 registros
- [ ] Processar 100 registros
- [ ] Medir tempo por registro

## 🚨 Problemas Identificados Durante Análise

### Bloqueadores Atuais
1. **Python não disponível** - Impede uso de LLM/CrewAI
2. **URL de teste não funcional** - Impede navegação real
3. **Campos CSV não mapeados** - Reduz cobertura de testes

### Próximos Passos
1. **Corrigir configuração de exemplo** para mapear todos os campos
2. **Criar página HTML de teste** local funcional
3. **Instalar Python** e dependências
4. **Executar testes funcionais** completos

## 📈 Métricas de Teste

| Tipo de Teste | Status | Observações |
|---------------|---------|-------------|
| Configuração | ✅ Parcial | Validação YAML funciona |
| CSV Loading | ✅ OK | Carregamento bem-sucedido |
| Browser Init | ⚠️ Não testado | Dependente de Python |
| Extração DOM | ⚠️ Não testado | URL não funcional |
| OCR Fallback | ⚠️ Não testado | Requer navegação |
| Relatórios | ⚠️ Não testado | Requer dados processados |
| Performance | ❌ Não testado | Requer execução completa |

## 📝 Registro de Execução

### Execução 1: Status Check
```bash
$ node dist/main.js status
🔍 DataHawk System Status

Node.js: v22.17.1 ✅
/bin/sh: 1: python: not found
Python: Not found ❌
```

### Execução 2: Config Validation
```bash
$ node dist/main.js config --validate --path config/sample-validation.yaml
🔍 Validating configuration: config/sample-validation.yaml
✅ Configuration is valid
```

**Observação:** Sistema valida configuração mesmo com campos CSV não mapeados.

### Execução 3: Dry Run
```bash
$ node dist/main.js validate --input data/input/sample.csv --config config/sample-validation.yaml --dry-run
🦅 DataHawk - Autonomous QA Browser Agent
✅ Dry run completed - configuration is valid
```

**Observação:** Dry run passa sem alertar sobre campos não mapeados.

## 🔍 Análise de Cobertura de Código

### Arquivos Analisados
- ✅ `src/main.ts` - CLI e comandos
- ✅ `src/core/taskmaster.ts` - Orquestração principal
- ✅ `src/automation/browser-agent.ts` - Automação de browser
- ⚠️ `src/agents/crew-orchestrator.ts` - Não analisado (depende de Python)
- ⚠️ `src/llm/` - Não analisado (depende de Python)
- ⚠️ `src/ocr/` - Não analisado (depende de navegação)

### Próxima Fase
Após correção dos problemas críticos, executaremos:
1. Testes de navegação real
2. Testes de extração de dados
3. Testes de validação completa
4. Testes de geração de relatórios
5. Testes de performance
