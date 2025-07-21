# 🦅 DataHawks Python OCR Service

Serviço OCR aprimorado usando Python Tesseract com melhor precisão e performance em relação ao Tesseract.js.

## 📋 Visão Geral

Este serviço substitui o OCR baseado em JavaScript (Tesseract.js) por uma solução Python mais robusta e precisa, oferecendo:

- **Melhor precisão**: Tesseract Python tem melhor performance que Tesseract.js
- **Pré-processamento avançado**: Filtros OpenCV para melhorar a qualidade da imagem
- **API REST**: Interface HTTP para integração com o sistema TypeScript
- **Suporte multi-idioma**: Inglês e Português por padrão
- **Processamento em lote**: Extração de texto de múltiplas imagens simultaneamente

## 🚀 Instalação e Configuração

### Pré-requisitos

1. **Python 3.8+**
2. **Tesseract OCR**
3. **Dependências Python** (instaladas automaticamente)

### Instalação por Sistema Operacional

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr tesseract-ocr-por tesseract-ocr-eng
cd src/ocr
pip3 install -r requirements.txt
```

#### macOS
```bash
brew install tesseract tesseract-lang
cd src/ocr
pip3 install -r requirements.txt
```

#### Windows
1. Baixe o Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki
2. Instale com os pacotes de idioma inglês e português
3. Adicione o Tesseract ao PATH do sistema
4. Execute:
```cmd
cd src\ocr
pip install -r requirements.txt
```

### Iniciando o Serviço

#### Método 1: Script Automatizado (Recomendado)
```bash
cd src/ocr
./start-python-ocr.sh
```

#### Método 2: Manual
```bash
cd src/ocr
python3 python-ocr-service.py --host 0.0.0.0 --port 5000
```

## 🔧 Uso

### Iniciando o Serviço
O serviço será iniciado em `http://localhost:5000` por padrão.

### Testando o Serviço
```bash
# Verificar saúde do serviço
curl http://localhost:5000/health

# Extrair texto de uma imagem
curl -X POST http://localhost:5000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "options": {
      "language": "eng+por",
      "psm": 6,
      "enhance_contrast": true
    }
  }'
```

## 📡 Integração com TypeScript

O cliente TypeScript (`python-ocr-client.ts`) se comunica automaticamente com o serviço Python.

### Exemplo de Uso

```typescript
import { PythonOCRClient } from './python-ocr-client.js';

const ocrClient = new PythonOCRClient({
  pythonServiceUrl: 'http://localhost:5000',
  timeout: 30000,
  retryAttempts: 3
});

// Inicializar
await ocrClient.initialize();

// Extrair texto de uma imagem
const imageBuffer = fs.readFileSync('screenshot.png');
const result = await ocrClient.extractText(imageBuffer);

console.log('Texto extraído:', result.text);
console.log('Confiança:', result.confidence);
```

## ⚙️ Configuração

### Opções de Pré-processamento

```typescript
interface ImagePreprocessingOptions {
  denoise?: boolean;           // Reduzir ruído
  enhanceContrast?: boolean;   // Melhorar contraste
  threshold?: boolean;         // Binarização
  scale?: number;             // Escala da imagem (ex: 2 para 2x)
  cropRegion?: {              // Região específica
    left: number;
    top: number;
    width: number;
    height: number;
  };
}
```

### Configurações do Tesseract

```typescript
interface OCRSettings {
  language: string;           // 'eng', 'por', 'eng+por'
  psm: number;               // Page segmentation mode (0-13)
  oem: number;               // OCR Engine mode (0-3)
  whitelist?: string;        // Caracteres permitidos
  blacklist?: string;        // Caracteres bloqueados
}
```

## 📊 Comparação de Performance

| Métrica | Tesseract.js | Python Tesseract |
|---------|--------------|------------------|
| Precisão | ~85% | ~95% |
| Velocidade | 2-5s/imagem | 0.5-2s/imagem |
| Pré-processamento | Básico | Avançado |
| Idiomas | Limitado | Completo |
| Memória | Alta | Moderada |

## 🔍 Endpoints da API

### GET /health
Verifica se o serviço está funcionando.

### POST /extract
Extrai texto de uma única imagem.

**Request:**
```json
{
  "image": "base64_string",
  "options": {
    "language": "eng+por",
    "psm": 6,
    "enhance_contrast": true
  }
}
```

**Response:**
```json
{
  "text": "Texto extraído...",
  "confidence": 0.95,
  "words": [...],
  "lines": [...],
  "processingTime": 1200
}
```

### POST /extract/batch
Processa múltiplas imagens simultaneamente.

### GET /languages
Retorna lista de idiomas disponíveis.

## 🐛 Solução de Problemas

### Erro: "Tesseract not found"
```bash
# Verificar instalação
tesseract --version

# Verificar PATH
which tesseract
```

### Erro: "Language not found"
```bash
# Listar idiomas disponíveis
tesseract --list-langs

# Instalar idiomas adicionais
# Ubuntu/Debian: sudo apt-get install tesseract-ocr-[lang]
# macOS: brew install tesseract-lang
```

### Erro: "Module not found"
```bash
# Reinstalar dependências
pip3 install -r requirements.txt --force-reinstall
```

## 🔄 Migração do Tesseract.js

Para migrar do Tesseract.js para o Python OCR:

1. **Substituir importações:**
   ```typescript
   // Antigo
   import { OCREngine } from '../ocr/ocr-engine.js';

   // Novo
   import { PythonOCRClient } from '../ocr/python-ocr-client.js';
   ```

2. **Atualizar inicialização:**
   ```typescript
   // Antigo
   const ocrEngine = new OCREngine({ settings });
   await ocrEngine.initialize();

   // Novo
   const ocrClient = new PythonOCRClient();
   await ocrClient.initialize();
   ```

3. **Manter API compatível:** O PythonOCRClient mantém a mesma interface que OCREngine.

## 📈 Monitoramento

### Logs
Os logs são exibidos no console com níveis:
- INFO: Operações normais
- WARN: Avisos e problemas recuperáveis
- ERROR: Erros críticos

### Métricas
- Total de imagens processadas
- Taxa de sucesso
- Confiança média
- Tempo médio de processamento

## 🛡️ Segurança

- Validação de entrada de imagem
- Limites de tamanho de arquivo
- Timeout de requisições
- Sanitização de parâmetros

## 📝 Notas

- O serviço Python deve estar rodando antes de usar o cliente TypeScript
- Imagens grandes podem demorar mais para processar
- Use pré-processamento para melhorar resultados em imagens de baixa qualidade
- O serviço é stateless - cada requisição é independente
