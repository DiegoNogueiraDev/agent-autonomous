
# DataHawk: Componentes Detalhados

## 1. CSV Loader (`src/core/csv-loader.ts`)

O `CSVLoader` é o ponto de partida para o processamento de dados no DataHawk. Sua principal responsabilidade é carregar, analisar e validar arquivos CSV, garantindo que os dados de entrada sejam consistentes e bem formatados.

### Funcionalidades:

- **Detecção Automática de Delimitador**: Analisa as primeiras linhas do arquivo para identificar automaticamente o delimitador utilizado (`,`, `;`, `|`, ou `\t`).
- **Parsing Robusto**: Utiliza a biblioteca Papa Parse para converter o texto do CSV em uma estrutura de dados JavaScript.
- **Normalização de Cabeçalhos**: Remove espaços em branco e converte os cabeçalhos para um formato consistente.
- **Validação Estrutural**: Verifica se o arquivo CSV possui cabeçalhos válidos e se todas as linhas têm o mesmo número de colunas.
- **Extração de Metadados**: Coleta informações importantes sobre o arquivo, como o número total de linhas, o delimitador detectado e o tempo de carregamento.

## 2. Config Manager (`src/core/config-manager.ts`)

O `ConfigManager` é responsável por carregar e validar o arquivo de configuração YAML. Ele garante que todas as configurações necessárias para o processo de validação estejam presentes e corretas.

### Funcionalidades:

- **Carregamento de YAML**: Lê e analisa o arquivo de configuração `.yaml`.
- **Validação com Zod**: Utiliza esquemas Zod para validar rigorosamente a estrutura e os tipos de dados da configuração.
- **Interpolação de Variáveis de Ambiente**: Substitui placeholders no arquivo de configuração (como `${API_KEY}`) pelos valores das variáveis de ambiente correspondentes.
- **Aplicação de Padrões**: Define valores padrão para configurações opcionais, simplificando o arquivo de configuração.

## 3. Crew Orchestrator (`src/agents/crew-orchestrator.ts`)

O `CrewOrchestrator` é o coração do sistema de múltiplos agentes. Ele inicializa e gerencia o ciclo de vida dos seis agentes especializados, garantindo que eles colaborem de forma eficiente para realizar a validação dos dados.

### Funcionalidades:

- **Inicialização dos Agentes**: Cria instâncias de cada um dos seis agentes (Navegador, Extrator, etc.).
- **Orquestração de Tarefas**: Define o fluxo de trabalho e distribui as tarefas para os agentes apropriados em cada etapa do processo.
- **Gerenciamento de Estado**: Mantém o estado da validação, passando os dados necessários de um agente para o outro.
- **Monitoramento e Tratamento de Erros**: Implementa mecanismos de "circuit breaker" e monitora a saúde dos agentes para garantir a robustez do sistema.

## 4. Browser Agent (`src/automation/browser-agent.ts`)

O `BrowserAgent` (e sua versão aprimorada `enhanced-browser-agent.ts`) é responsável por toda a interação com o navegador, utilizando o Playwright para automatizar a navegação e a extração de dados.

### Funcionalidades:

- **Navegação Inteligente**: Navega para as URLs de destino, preenchendo templates com dados do CSV.
- **Extração de DOM**: Utiliza seletores CSS para extrair dados diretamente da estrutura da página.
- **Interação com a Página**: Pode realizar ações como cliques e preenchimento de formulários, se necessário.
- **Lógica de Retentativa**: Tenta novamente a navegação ou a extração em caso de falhas temporárias.

## 5. OCR Engine (`src/ocr/ocr-engine.ts`)

O `OCREngine` entra em ação quando a extração de dados via DOM não é possível ou suficiente. Ele utiliza o Tesseract.js para "ler" o texto de imagens.

### Funcionalidades:

- **Captura de Tela de Elementos**: Tira screenshots de áreas específicas da página.
- **Pré-processamento de Imagem**: Utiliza a biblioteca Sharp.js para melhorar a qualidade da imagem antes do reconhecimento (por exemplo, ajustando contraste e brilho).
- **Reconhecimento de Texto**: Processa a imagem com o Tesseract.js para extrair o texto.
- **Suporte a Múltiplos Idiomas**: Pode ser configurado para reconhecer texto em diferentes idiomas.

## 6. Local LLM Engine (`src/llm/local-llm-engine.ts`)

O `LocalLLMEngine` integra o modelo de linguagem Llama-3 8B ao processo de validação, permitindo que o DataHawk tome decisões inteligentes e contextuais.

### Funcionalidades:

- **Integração com Servidor Python**: Comunica-se com um servidor Python local (`llm-server.py`) que hospeda o modelo Llama-3.
- **Engenharia de Prompt**: Cria prompts otimizados para o LLM, fornecendo o contexto necessário para a validação.
- **Análise de Respostas**: Interpreta a resposta do LLM para determinar o resultado da validação e a pontuação de confiança.
- **Fallback Inteligente**: Caso o servidor LLM não esteja disponível, ele pode recorrer a um modo de validação mais simples para garantir a continuidade do processo.

## 7. Evidence Collector (`src/evidence/evidence-collector.ts`)

O `EvidenceCollector` é crucial para a auditoria e conformidade. Ele cria um registro detalhado de todo o processo de validação.

### Funcionalidades:

- **Captura de Evidências**: Salva screenshots da página inteira e de elementos específicos.
- **Snapshots do DOM**: Armazena o estado completo do DOM no momento da validação.
- **Logs Estruturados**: Mantém um registro detalhado de todas as ações e decisões tomadas.
- **Indexação de Evidências**: Organiza todas as evidências em uma estrutura de pastas clara e cria um arquivo de índice (`evidence_index.json`) para fácil acesso.

## 8. Report Generator (`src/reporting/report-generator.ts`)

O `ReportGenerator` é o componente final do pipeline. Ele compila todos os resultados e evidências em relatórios fáceis de entender.

### Funcionalidades:

- **Geração de Múltiplos Formatos**: Cria relatórios em JSON, HTML, Markdown e CSV.
- **Relatórios Interativos**: O relatório HTML é um painel interativo com gráficos e links para as evidências coletadas.
- **Integração de Evidências**: Incorpora links para as evidências nos relatórios, permitindo uma análise detalhada dos resultados.
- **Customização**: Permite a seleção dos formatos de relatório a serem gerados. 