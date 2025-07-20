# Issue 003: Falha de Conexão com Servidor LLM Local

## Problema Identificado
O sistema está falhando ao conectar com o servidor LLM local, resultando no uso de uma implementação stub que não fornece funcionalidade real de IA.

## Detalhes Técnicos
- **Arquivo afetado**: `src/llm/local-llm-engine.ts`
- **Erro específico**: `warn: LLM server not running, using stub implementation`
- **Servidor esperado**: `llama.cpp` na porta padrão
- **Modelo esperado**: `./models/mistral-7b-instruct-q4_k_m.gguf`

## Impacto
- Extração de dados comprometida (apenas stub sendo usado)
- Validação de OCR não funcional
- Relatórios gerados sem análise real de IA
- Performance degradada significativamente

## Diagnóstico
1. **Servidor não iniciado**: O servidor `llama.cpp` não está rodando
2. **Modelo não encontrado**: Arquivo do modelo pode não existir no caminho especificado
3. **Porta incorreta**: Servidor pode estar em porta diferente
4. **Dependências ausentes**: `llama.cpp` pode não estar instalado/compilado

## Verificação Necessária
```bash
# Verificar se o modelo existe
ls -la models/mistral-7b-instruct-q4_k_m.gguf

# Verificar se o servidor está rodando
curl http://localhost:8080/health

# Verificar processos do llama.cpp
ps aux | grep llama
```

## Solução Proposta
1. **Verificar instalação do llama.cpp**:
   ```bash
   cd llama.cpp
   make
   ```

2. **Baixar modelo se necessário**:
   ```bash
   mkdir -p models
   wget -O models/mistral-7b-instruct-q4_k_m.gguf [URL_DO_MODELO]
   ```

3. **Iniciar servidor LLM**:
   ```bash
   ./llama.cpp/server -m models/mistral-7b-instruct-q4_k_m.gguf --port 8080
   ```

4. **Atualizar configuração de conexão** em `src/llm/local-llm-engine.ts`:
   - Adicionar retry logic
   - Melhorar mensagens de erro
   - Fallback para API externa se local falhar

## Arquivos para Atualizar
- `src/llm/local-llm-engine.ts`
- `scripts/start-llm-server.sh` (novo script)
- `README.md` (instruções de instalação)
- `.env.example` (configurações de conexão)
