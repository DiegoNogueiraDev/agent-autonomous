
# DataHawk: Guia de Instalação e Uso

Este guia fornece as instruções necessárias para configurar e executar o DataHawk em seu ambiente local.

## 1. Pré-requisitos

Antes de começar, certifique-se de que você tenha os seguintes softwares instalados:

- **Node.js**: Versão 18 ou superior.
- **npm**: Geralmente instalado com o Node.js.
- **Python**: Versão 3.9 ou superior.
- **pip**: Gerenciador de pacotes do Python.

## 2. Instalação

Siga os passos abaixo para instalar as dependências do projeto.

### 2.1. Dependências do Node.js

Clone o repositório e instale as dependências do Node.js:

```bash
git clone <URL_DO_REPOSITORIO>
cd datahawk
npm install
```

### 2.2. Navegadores do Playwright

O DataHawk utiliza o Playwright para automação do navegador. Instale os navegadores necessários com o seguinte comando:

```bash
npx playwright install chromium
```

### 2.3. Dependências do Python (para o LLM)

Para utilizar a validação com o LLM local, instale as dependências do Python:

```bash
pip install -r requirements.txt
```

## 3. Configuração do LLM Local (Opcional)

Para executar a validação com o modelo de linguagem Llama-3, você precisará baixar o modelo e iniciar o servidor Python.

### 3.1. Baixando o Modelo

Baixe o modelo Llama-3 8B (formato GGUF) e coloque-o na pasta `./models/`. Um exemplo de nome de arquivo é `llama3-8b-instruct.Q4_K_M.gguf`.

### 3.2. Iniciando o Servidor LLM

Abra um novo terminal e inicie o servidor LLM com o seguinte comando:

```bash
python llm-server.py --model ./models/llama3-8b-instruct.Q4_K_M.gguf
```

O servidor estará em execução e pronto para receber solicitações do DataHawk. Se o servidor não estiver em execução, o DataHawk utilizará um modo de validação básico.

## 4. Executando o DataHawk

Com tudo configurado, você pode executar o DataHawk usando o comando `npm start`.

### 4.1. Sintaxe do Comando

O comando principal para iniciar a validação é:

```bash
npm start -- validate \
  --input="<caminho_para_seu_arquivo.csv>" \
  --config="<caminho_para_sua_config.yaml>" \
  --output="<pasta_de_saida_para_relatorios>" \
  --format="<formatos_de_relatorio>"
```

- `--input`: Caminho para o arquivo CSV com os dados a serem validados.
- `--config`: Caminho para o arquivo de configuração YAML.
- `--output`: Pasta onde os relatórios e as evidências serão salvos.
- `--format`: Formatos de relatório desejados, separados por vírgula (ex: `json,html,md`).

### 4.2. Exemplo de Comando

```bash
npm start -- validate \
  --input="data/sample.csv" \
  -config="config/sample-validation.yaml" \
  --output="test-output" \
  --format="json,html"
```

Este comando irá:
1. Ler os dados do arquivo `data/sample.csv`.
2. Usar as configurações do arquivo `config/sample-validation.yaml`.
3. Salvar os relatórios e evidências na pasta `test-output`.
4. Gerar relatórios nos formatos JSON e HTML.

## 5. Interpretando os Resultados

Após a execução, a pasta de saída (`test-output` no exemplo acima) conterá:

- **Relatórios**: Arquivos nos formatos que você especificou (ex: `datahawk-report-xxxxxxxx.json`, `datahawk-report-xxxxxxxx.html`).
- **Pasta de Evidências (`evidence/`)**: Dentro desta pasta, você encontrará:
    - **`screenshots/`**: Imagens capturadas durante a validação.
    - **`dom-snapshots/`**: Arquivos HTML com o estado do DOM no momento da validação.
    - **`logs/`**: Logs detalhados do processo.
    - **`evidence_index.json`**: Um arquivo de índice que conecta os resultados da validação às suas respectivas evidências.

O relatório em HTML (`datahawk-report-xxxxxxxx.html`) é a forma mais fácil de visualizar os resultados, pois fornece um painel interativo com um resumo da validação e links diretos para as evidências. 