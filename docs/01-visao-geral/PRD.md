Product Requirements Document (PRD)
Autonomous QA Browser Agent – Codename: DataHawk
Last updated: 2025‑07‑19
Authors: Diego Nogueira, ChatGPT

---

## Tabela de Conteúdos

1. PREVC Overview
2. Objetivos & Não‑Objetivos
3. Métricas de Sucesso
4. Personas & User Stories
5. Requisitos Funcionais
6. Requisitos Não‑Funcionais
7. Arquitetura do Sistema
8. Pipeline Taskmaster
9. Cronograma & Marcos
10. Questões em Aberto / Riscos
11. Referências

---

### 1. PREVC Overview

**Problema (P)**
A validação manual de dados entre arquivos CSV carregados e interfaces web é lenta, sujeita a erro humano e não acompanha a cadência de deploys semanais.

**Relevância (R)**
A cada nova versão da aplicação, mudanças de layout e selectores quebram suites de teste convencionais, exigindo retrabalho caro de QA.

**Evidência (E)**
Pilotos internos indicam \~4 h para auditar 500 linhas; 18 % de discrepâncias são perdidas por fadiga.

**Visão (V)**
Criar um agente autônomo local, alimentado por LLM (Mistral‑7B‑Instruct quantizado, executando via llama‑cpp em CPU 16 GB), orquestrado via CrewAI ou Argo. O agente integra‑se ao Playwright através do Model Context Protocol (MCP) ou chamadas diretas, captura o DOM e/ou screenshots → OCR (Tesseract.js) e decide os próximos passos. Ele navega até localizar cada valor do CSV, registra evidências, gera um relatório detalhado em Markdown/HTML/JSON e finaliza.

**Critérios de Mudança (C)**

* Cobertura ≥ 95 % dos campos do CSV
* Falsos negativos ≤ 2 %
* Tempo total ≤ 10 min para 500 linhas
* Execução 100 % offline em CPU 16 GB

---

### 2. Objetivos & Não‑Objetivos

**Objetivos**

* Executar totalmente offline (privacidade)
* Suportar CSV até 50 k linhas
* Aderir a Playwright ≥ v1.44
* Relatório único por execução, pronto para CI/CD

**Não‑Objetivos**

* Testes de performance ou carga
* Rastreamento de páginas com scroll infinito

---

### 3. Métricas de Sucesso

| Métrica               | Alvo                    |
| --------------------- | ----------------------- |
| Cobertura de campos   | ≥ 95 %                  |
| Precisão OCR          | ≥ 98 % em fontes padrão |
| Tempo médio por linha | ≤ 1,2 s                 |
| Uso de memória pico   | ≤ 14 GB                 |

---

### 4. Personas & User Stories

**QA Lead – Carol**
*“Quero validar rapidamente se os dados do ERP chegaram corretos na UI, sem escrever novos scripts a cada release.”*

**DevOps – Bruno**
*“Preciso de uma etapa CI que rode em runner CPU e falhe o deploy se a validação não passar.”*

---

### 5. Requisitos Funcionais

| ID   | Descrição                                                                         |
| ---- | --------------------------------------------------------------------------------- |
| FR‑1 | Framework de agentes: selecionar CrewAI ou Argo via flag CLI                      |
| FR‑2 | Modelo: Mistral‑7B‑Instruct (GGUF Q4\_K\_M) com fallback Tiny‑Dolphin‑2.8B        |
| FR‑3 | Fine‑tuning: QLoRA em prompts de domínios específicos                             |
| FR‑4 | Integração Playwright: MCP server; fallback API page.\*                           |
| FR‑5 | OCR: Tesseract.js via Node; pipeline de pré‑processamento (binarização + upscale) |
| FR‑6 | Loader CSV: detectar delimitador, validar schema │                                |
| FR‑7 | Orquestração Taskmaster: Load → Navigate → Validate → Report → Exit               |
| FR‑8 | Relatórios: Markdown + JSON; anexar screenshots de falha                          |

---

### 6. Requisitos Não‑Funcionais

* **Performance:** concluído em ≤ 10 min/500 linhas
* **Portabilidade:** Linux & Windows x64
* **Segurança:** dados somente locais; sem chamadas externas
* **Observabilidade:** logs estruturados em JSON; traces Span‑ID por linha

---

### 7. Arquitetura do Sistema

```
CSV
 │
 ▼ (Loader)
Taskmaster ───▶ Agent Orchestration (CrewAI/Argo)
 │                │
 │                ├─► LLM (Mistral‑7B, llama‑cpp)
 │                └─► Decision Engine
 ▼
Playwright MCP Server
 │
 ├─ DOM Snapshot → Decision Engine
 └─ Screenshot → OCR → Decision Engine
```

---

### 8. Pipeline Taskmaster

1. **task\_load\_csv**: parse & validate schema
2. **task\_launch\_browser**: iniciar Playwright headless
3. **task\_iterate\_rows**:

   * Localizar valor ➜ DOM query
   * Se não achar ➜ screenshot ➜ OCR ➜ fuzzy match
4. **task\_record\_evidence**
5. **task\_generate\_report**
6. **task\_finalize**: retornar exit codes

---

### 9. Cronograma & Marcos

| Marco  | Data      | Entregável                          |
| ------ | --------- | ----------------------------------- |
| M0     | 26‑Jul‑25 | PoC navegando e validando 10 linhas |
| M1     | 09‑Ago‑25 | Integração OCR + fallback           |
| M2     | 30‑Ago‑25 | Relatórios HTML no CI               |
| Launch | 15‑Set‑25 | V1.0 GA                             |

---

### 10. Questões em Aberto / Riscos

* Qualidade OCR em layouts complexos
* Manutenção de selectores dinâmicos
* Latência do modelo em CPU dual‑core

---

### 11. Referências

* CrewAI, Argo, Playwright MCP, Tesseract.js docs, Browser‑Use framework

---
