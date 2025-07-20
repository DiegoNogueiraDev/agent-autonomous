# Plano de Ação: Alinhamento do DataHawk com o PRD

**Documento:** ROADMAP.md
**Data:** 2025-07-19
**Autor:** Gemini

## 1. Introdução

Este documento detalha o plano de ação para evoluir a implementação atual do DataHawk e alinhá-la com os requisitos funcionais e a visão descrita no `PRD.md`. O foco principal é a introdução de um Modelo de Linguagem (LLM) para a tomada de decisão, a adoção de um framework de agentes (CrewAI) para orquestração e a refatoração do fluxo de validação.

O trabalho será dividido em três épicos principais, cada um com tarefas e subtarefas específicas.

---

## 2. Épico 1: Integração de Modelo de Linguagem (LLM)

**Objetivo:** Integrar o modelo Mistral-7B-Instruct (GGUF) para fornecer a capacidade de decisão inteligente ao agente, substituindo a lógica de regras atual.

### Tarefa 1.1: Configurar o Ambiente para o LLM
- **Descrição:** Adicionar as dependências necessárias e configurar o projeto para carregar e interagir com um modelo de linguagem local.
- **Subtarefas:**
    - [ ] **1.1.1:** Adicionar `llama-cpp-python` ao arquivo `requirements.txt`.
    - [ ] **1.1.2:** Atualizar o modelo `AgentConfig` em `datahawk/models/data_models.py` para incluir novos parâmetros de configuração do LLM (ex: `model_path`, `n_gpu_layers`, `temperature`, `max_tokens`).
    - [ ] **1.1.3:** Atualizar o `cli.py` para aceitar os novos parâmetros de configuração do LLM via flags de linha de comando (ex: `--model-path`).
    - [ ] **1.1.4:** Adicionar uma verificação no `cli.py` para garantir que o arquivo do modelo (`.gguf`) existe no caminho especificado antes de iniciar a execução.

### Tarefa 1.2: Criar um Wrapper para o Modelo LLM
- **Descrição:** Abstrair a complexidade de interagir com o `llama-cpp-python` em uma classe dedicada.
- **Subtarefas:**
    - [ ] **1.2.1:** Criar um novo arquivo: `datahawk/core/llm_provider.py`.
    - [ ] **1.2.2:** Dentro de `llm_provider.py`, criar uma classe `LLMProvider`.
    - [ ] **1.2.3:** O construtor da `LLMProvider` deve receber os parâmetros de configuração do modelo e inicializar a instância `Llama` do `llama-cpp-python`.
    - [ ] **1.2.4:** Implementar um método `generate_structured_output(prompt: str) -> dict` que envia um prompt ao LLM e garante que a saída seja um JSON válido, tratando possíveis erros de formatação.

### Tarefa 1.3: Gerenciar o Download e o Uso do Modelo
- **Descrição:** Fornecer instruções claras para o usuário final sobre como obter o modelo LLM necessário.
- **Subtarefas:**
    - [ ] **1.3.1:** Atualizar o `README.md` com uma seção "Requisitos do Modelo", incluindo o link para download do `Mistral-7B-Instruct-v0.2.Q4_K_M.gguf` e instruções sobre onde colocá-lo.

---

## 3. Épico 2: Adoção de Framework de Agentes (CrewAI)

**Objetivo:** Substituir a orquestração procedural do `TaskMaster` por uma arquitetura baseada em agentes com CrewAI, conforme previsto no PRD.

### Tarefa 2.1: Integrar o CrewAI ao Projeto
- **Descrição:** Adicionar a biblioteca CrewAI e criar a estrutura básica para os agentes.
- **Subtarefas:**
    - [ ] **2.1.1:** Adicionar `crewai` e `crewai[tools]` ao `requirements.txt`.
    - [ ] **2.1.2:** Criar uma nova estrutura de diretórios: `datahawk/crew/`.
    - [ ] **2.1.3:** Criar os arquivos iniciais: `datahawk/crew/agents.py`, `datahawk/crew/tasks.py`, `datahawk/crew/tools.py`, e `datahawk/crew/crew.py`.

### Tarefa 2.2: Definir Ferramentas (Tools) para os Agentes
- **Descrição:** Expor as funcionalidades existentes (como navegar, tirar screenshot, OCR) como ferramentas que os agentes do CrewAI possam utilizar.
- **Subtarefas:**
    - [ ] **2.2.1:** Em `datahawk/crew/tools.py`, importar o `BrowserAgent` e o `OCRProcessor`.
    - [ ] **2.2.2:** Criar funções wrapper para os métodos do `BrowserAgent` (ex: `navigate_to`, `search_value_in_page`, `take_screenshot`) e decorá-las com o `@tool` do CrewAI.
    - [ ] **2.2.3:** Criar uma ferramenta similar para a funcionalidade de OCR do `OCRProcessor`.

### Tarefa 2.3: Definir Agentes e Tarefas do CrewAI
- **Descrição:** Criar os agentes especializados e as tarefas que eles irão executar.
- **Subtarefas:**
    - [ ] **2.3.1:** Em `datahawk/crew/agents.py`, definir os seguintes agentes:
        - **`BrowserNavigatorAgent`**: Responsável pela navegação e interação com a página web. Utilizará as ferramentas de browser.
        - **`DataAnalysisAgent`**: Responsável por analisar o conteúdo da página (DOM, OCR) e decidir se um valor foi encontrado. Utilizará o `LLMProvider` para tomar decisões.
    - [ ] **2.3.2:** Em `datahawk/crew/tasks.py`, definir as tarefas que orquestram o trabalho dos agentes, como:
        - **`validate_row_task`**: Uma tarefa complexa que recebe uma linha do CSV e coordena os agentes para encontrar cada valor na página.

### Tarefa 2.4: Criar a "Tripulação" (Crew)
- **Descrição:** Montar a equipe de agentes e tarefas em um `Crew` que executará o fluxo de validação.
- **Subtarefas:**
    - [ ] **2.4.1:** Em `datahawk/crew/crew.py`, criar uma função `setup_crew(...)` que inicializa os agentes, as tarefas e o objeto `Crew`.
    - [ ] **2.4.2:** Configurar o `Crew` para operar em um processo sequencial, garantindo que a validação de uma linha seja concluída antes de passar para a próxima.

---

## 4. Épico 3: Refatoração do Core de Validação

**Objetivo:** Unir os novos componentes (LLM e CrewAI) com a estrutura existente, substituindo a lógica antiga.

### Tarefa 3.1: Refatorar o `TaskMaster`
- **Descrição:** Modificar o `TaskMaster` para atuar como um orquestrador de alto nível que delega o trabalho pesado para o CrewAI.
- **Subtarefas:**
    - [ ] **3.1.1:** Modificar o método `task_iterate_rows` em `datahawk/tasks/taskmaster.py`.
    - [ ] **3.1.2:** Remover o loop de validação manual e a chamada direta ao `_validate_record`.
    - [ ] **3.1.3:** Em seu lugar, inicializar e executar o `Crew` para cada linha do CSV, passando os dados da linha como input para a tarefa principal do Crew.
    - [ ] **3.1.4:** Coletar os resultados da execução do `Crew` e atualizar o status do `CSVRecord` correspondente.

### Tarefa 3.2: Substituir o `DecisionEngine` por Prompts de LLM
- **Descrição:** A lógica de validação baseada em regras será totalmente substituída por prompts enviados ao `DataAnalysisAgent`.
- **Subtarefas:**
    - [ ] **3.2.1:** Criar um novo arquivo `datahawk/crew/prompts.py` para armazenar os templates de prompt.
    - [ ] **3.2.2:** Desenvolver um prompt detalhado que instrua o LLM a analisar um trecho de DOM ou texto de OCR e a determinar, com base no valor esperado, se a validação foi bem-sucedida. O prompt deve solicitar uma saída em JSON com o status (`found`, `not_found`) e a evidência (`matched_text`).
    - [ ] **3.2.3:** Remover o arquivo `datahawk/core/decision_engine.py` do projeto.

### Tarefa 3.3: Testes de Integração
- **Descrição:** Garantir que o novo fluxo de ponta a ponta funcione corretamente.
- **Subtarefas:**
    - [ ] **3.3.1:** Criar um novo conjunto de testes em `tests/` para validar o fluxo com o CrewAI.
    - [ ] **3.3.2:** Executar o `simple_test.py` e ajustá-lo para o novo fluxo, garantindo que ele passe com sucesso.
    - [ ] **3.3.3:** Validar que os relatórios (Markdown, JSON) continuam sendo gerados corretamente com os resultados do `Crew`.
