# Plano de Teste de Usabilidade - DataHawk Agent Autonomous

## 📋 Objetivo
Realizar testes abrangentes de usabilidade da ferramenta DataHawk usando todas as massas de dados disponíveis em `data/*` para identificar bugs, problemas de performance e melhorias de UX.

## 🗂️ Massas de Dados Identificadas

### Arquivos CSV Principais:
1. **`data/input/sample.csv`** - Dados básicos de teste (5 registros)
2. **`data/wikipedia-test.csv`** / **`data/wikipedia_test.csv`** - Teste com dados da Wikipedia
3. **`data/gov-br-test.csv`** - Teste com dados do governo brasileiro
4. **`data/special-chars-test.csv`** / **`data/special_chars_test.csv`** - Teste com caracteres especiais
5. **`data/fixed-wikipedia-test.csv`** - Versão corrigida dos dados Wikipedia
6. **`data/invalid_test.csv`** / **`data/test-invalid.csv`** - Dados inválidos para teste de robustez
7. **`data/test-large.csv`** - Arquivo grande para teste de performance
8. **`data/input/corrupted-test.csv`** - Dados corrompidos
9. **`data/input/huge-test.csv`** - Arquivo muito grande
10. **`data/input/large-test.csv`** - Arquivo grande adicional

### Vídeos de Evidência:
- **`data/evidence/videos/`** - 300+ arquivos .webm com evidências de execução

## 🧪 Cenários de Teste

### Categoria 1: Testes Funcionais Básicos
**Objetivo:** Validar funcionalidades core
- **TC001:** Processamento de dados simples (`sample.csv`)
- **TC002:** Validação de campos obrigatórios
- **TC003:** Verificação de integridade de dados
- **TC004:** Teste de geração de relatórios

### Categoria 2: Testes de Robustez
**Objetivo:** Verificar comportamento com dados problemáticos
- **TC005:** Dados corrompidos (`corrupted-test.csv`)
- **TC006:** Dados inválidos (`invalid_test.csv`)
- **TC007:** Campos com valores nulos/vazios
- **TC008:** Formatos de data inconsistentes

### Categoria 3: Testes de Performance
**Objetivo:** Avaliar limites da ferramenta
- **TC009:** Arquivo grande (`large-test.csv`)
- **TC010:** Arquivo muito grande (`huge-test.csv`)
- **TC011:** Múltiplos processamentos simultâneos
- **TC012:** Monitoramento de memória e CPU

### Categoria 4: Testes de Internacionalização
**Objetivo:** Validar suporte a caracteres especiais
- **TC013:** Caracteres especiais (`special-chars-test.csv`)
- **TC014:** Acentos e cedilhas
- **TC015:** Emojis e símbolos Unicode
- **TC016:** Diferentes encodings

### Categoria 5: Testes de Integração Web
**Objetivo:** Validar automação web
- **TC017:** Sites governamentais (`gov-br-test.csv`)
- **TC018:** Wikipedia (`wikipedia-test.csv`)
- **TC019:** Sites com JavaScript complexo
- **TC020:** Timeouts e conexões lentas

### Categoria 6: Testes de LLM
**Objetivo:** Verificar integração com servidor LLM
- **TC021:** Validação de dados via LLM
- **TC022:** Geração de respostas contextuais
- **TC023:** Análise semântica de campos
- **TC024:** Performance do modelo

## 🔧 Metodologia de Execução

### Pré-requisitos:
- ✅ Servidor LLM ativo (confirmado: `localhost:8000/health`)
- ✅ DataHawk configurado
- ✅ Massas de dados acessíveis

### Processo de Teste:
1. **Preparação**
   - Backup dos dados originais
   - Limpeza de logs anteriores
   - Verificação do ambiente

2. **Execução**
   - Executar cada cenário individualmente
   - Capturar logs detalhados
   - Gravar evidências em vídeo (quando aplicável)
   - Medir tempos de resposta

3. **Análise**
   - Identificar falhas e erros
   - Classificar criticidade dos bugs
   - Documentar workarounds

4. **Documentação**
   - Criar relatório de bug por falha encontrada
   - Evidências em `docs/8-issues/`
   - Propor correções

## 📊 Critérios de Sucesso

### Performance:
- Processamento de arquivos pequenos (< 1MB): < 30 segundos
- Processamento de arquivos médios (1-10MB): < 5 minutos
- Processamento de arquivos grandes (> 10MB): < 30 minutos

### Robustez:
- Taxa de sucesso > 90% para dados válidos
- Graceful degradation para dados inválidos
- Recovery automático de falhas temporárias

### Usabilidade:
- Logs claros e informativos
- Mensagens de erro compreensíveis
- Relatórios úteis e estruturados

## 🐛 Template de Documentação de Bug

Para cada bug encontrado, criar arquivo `BUG-XXX.md` em `docs/8-issues/`:

```markdown
# BUG-XXX: [Título do Bug]

## 📋 Informações Básicas
- **ID:** BUG-XXX
- **Data:** YYYY-MM-DD
- **Severidade:** Critical/High/Medium/Low
- **Status:** Open/In Progress/Fixed/Closed

## 🔍 Descrição
Descrição detalhada do problema...

## 📂 Massa de Dados
- **Arquivo:** data/filename.csv
- **Tamanho:** X KB/MB
- **Características:** descrição dos dados

## 🔄 Passos para Reproduzir
1. Passo 1
2. Passo 2
3. Passo 3

## 📋 Resultado Esperado
O que deveria acontecer...

## ❌ Resultado Atual
O que realmente acontece...

## 📝 Logs/Evidências
```
logs relevantes
```

## 💡 Possíveis Causas
- Causa 1
- Causa 2

## 🔧 Solução Proposta
Descrição da correção sugerida...

## 📎 Anexos
- Screenshots
- Logs completos
- Vídeos de evidência
```

## 📅 Cronograma

### Fase 1: Testes Básicos (2-3 horas)
- TC001-TC004: Funcionalidades core
- TC021-TC024: Integração LLM

### Fase 2: Testes de Robustez (2-3 horas)  
- TC005-TC008: Dados problemáticos
- TC013-TC016: Caracteres especiais

### Fase 3: Testes de Performance (3-4 horas)
- TC009-TC012: Arquivos grandes
- Análise de limites da ferramenta

### Fase 4: Testes de Integração Web (2-3 horas)
- TC017-TC020: Sites reais
- Validação de automação

### Fase 5: Análise e Documentação (2-3 horas)
- Compilação de resultados
- Documentação de bugs
- Relatório final

## 🎯 Próximos Passos
1. Executar Fase 1: Testes Básicos
2. Documentar primeiro conjunto de bugs
3. Continuar sequencialmente pelas demais fases
4. Gerar relatório consolidado