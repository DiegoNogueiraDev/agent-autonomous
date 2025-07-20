# BUG-007: Falha na Inicialização do OCR com Múltiplos Idiomas

## Descrição
O OCR Engine falha silenciosamente quando configurado para usar múltiplos idiomas (por exemplo, 'eng+por'), sem verificar adequadamente se os arquivos de dados de idioma estão disponíveis no sistema. Isso causa problemas de inicialização e pode levar a resultados incorretos ou vazios durante a extração de texto, especialmente com caracteres especiais.

## Passos para Reprodução
1. Configurar o OCR Engine com múltiplos idiomas:
   ```typescript
   const multiLangSettings: OCRSettings = {
     language: 'eng+por',
     mode: 6,
     confidenceThreshold: 0.6
   };

   const ocrEngine = new OCREngine({ settings: multiLangSettings });
   await ocrEngine.initialize();
   ```
2. Tentar extrair texto de uma imagem com caracteres especiais ou acentuação
3. Observar que a extração falha silenciosamente ou retorna texto sem acentuação

## Comportamento Esperado
1. O OCR Engine deve verificar a disponibilidade dos arquivos de dados de idioma durante a inicialização
2. Se os arquivos não estiverem disponíveis, deve gerar um erro explícito ou fazer download automático
3. A extração de texto com caracteres específicos do idioma deve funcionar corretamente

## Comportamento Atual
O OCR Engine não verifica adequadamente a disponibilidade de arquivos de dados de idioma e não reporta erros claros quando tenta usar um idioma que não está instalado. Em vez disso, ele inicializa parcialmente e depois falha durante a extração de texto ou retorna resultados incorretos.

Examinando o código atual do OCR Engine:

```typescript
async initialize(): Promise<void> {
  try {
    this.logger.info('Initializing OCR Engine', {
      language: this.settings.language,
      mode: this.settings.mode
    });

    this.worker = await Tesseract.createWorker(this.settings.language);

    // Configure worker parameters for better accuracy
    await this.worker.setParameters({
      tessedit_page_seg_mode: this.settings.mode,
      tessedit_char_whitelist: this.settings.whitelist || '',
    });

    this.initialized = true;
    this.logger.info('OCR Engine initialized successfully');

  } catch (error) {
    this.logger.error('Failed to initialize OCR engine', error);
    throw error;
  }
}
```

Não há verificação explícita se os idiomas configurados estão disponíveis, e o teste que deveria verificar isso é incompleto:

```typescript
test('should handle different language settings', async () => {
  const multiLangSettings: OCRSettings = {
    ...testSettings,
    language: 'eng+por'
  };

  const multiLangEngine = new OCREngine({ settings: multiLangSettings });

  await multiLangEngine.initialize();
  expect(multiLangEngine.isInitialized()).toBe(true);

  await multiLangEngine.cleanup();
}, 30000);
```

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Tesseract.js: versão no package.json
- Arquivos de dados de idioma: Ausentes ou incorretamente instalados

## Evidências
1. O arquivo de treinamento `por.traineddata` está presente no diretório raiz do projeto, mas não está sendo carregado corretamente
2. O teste que deveria verificar idiomas múltiplos é superficial e não testa a extração real de texto
3. O log mostra que a inicialização aparentemente é bem-sucedida, mas falha durante a extração

## Possível Solução
1. **Verificar a disponibilidade de arquivos de idioma explicitamente**:
   ```typescript
   async initialize(): Promise<void> {
     try {
       this.logger.info('Initializing OCR Engine', {
         language: this.settings.language,
         mode: this.settings.mode
       });

       const languages = this.settings.language.split('+');

       // Verificar se todos os idiomas estão disponíveis
       for (const lang of languages) {
         const langAvailable = await this.checkLanguageAvailability(lang);
         if (!langAvailable) {
           this.logger.warn(`Language data for '${lang}' not found. Results may be incorrect.`);
         }
       }

       this.worker = await Tesseract.createWorker(this.settings.language);

       // Configure worker parameters for better accuracy
       await this.worker.setParameters({
         tessedit_page_seg_mode: this.settings.mode,
         tessedit_char_whitelist: this.settings.whitelist || '',
       });

       // Verify initialization with a simple test
       const initStatus = await this.worker.recognize(this.createTestImage());
       if (initStatus.data.confidence < 20) {
         throw new Error('OCR initialization verification failed');
       }

       this.initialized = true;
       this.logger.info('OCR Engine initialized successfully');

     } catch (error) {
       this.logger.error('Failed to initialize OCR engine', error);
       throw error;
     }
   }

   async checkLanguageAvailability(lang: string): Promise<boolean> {
     // Verificar se o arquivo de treinamento existe
     try {
       // Verifique na pasta atual
       await fs.access(`${lang}.traineddata`);
       return true;
     } catch {
       // Verificar em locais comuns do Tesseract
       try {
         // Verificar caminhos comuns dependendo do sistema
         const possiblePaths = [
           `/usr/share/tesseract-ocr/4.00/tessdata/${lang}.traineddata`,
           `/usr/local/share/tessdata/${lang}.traineddata`,
           `./node_modules/tesseract.js-core/tesseract-core-simd.wasm.js`,
           `./tessdata/${lang}.traineddata`
         ];

         for (const path of possiblePaths) {
           try {
             await fs.access(path);
             return true;
           } catch {
             // Continuar tentando o próximo caminho
           }
         }

         return false;
       } catch {
         return false;
       }
     }
   }

   createTestImage(): Buffer {
     // Cria uma imagem simples para testar o OCR
     // Pode usar uma imagem pré-gerada ou criar uma com texto simples
     // Retorna um Buffer
   }
   ```

2. **Adicionar download automático de arquivos de idioma faltantes**:
   ```typescript
   async downloadLanguageData(lang: string): Promise<boolean> {
     try {
       this.logger.info(`Downloading language data for ${lang}...`);

       // Use a API do Tesseract.js para baixar dados de idioma
       await Tesseract.downloadLanguage(lang);

       return true;
     } catch (error) {
       this.logger.error(`Failed to download language data for ${lang}`, error);
       return false;
     }
   }
   ```

3. **Melhorar os testes**:
   ```typescript
   test('should extract text with special characters in multiple languages', async () => {
     // Configurar OCR com múltiplos idiomas
     const multiLangSettings: OCRSettings = {
       language: 'eng+por',
       mode: 6,
       confidenceThreshold: 0.6
     };

     const multiLangEngine = new OCREngine({ settings: multiLangSettings });
     await multiLangEngine.initialize();

     // Criar ou carregar uma imagem de teste com caracteres especiais
     const testImagePath = path.join(__dirname, '../fixtures/special-chars-test.png');
     const imageBuffer = await fs.readFile(testImagePath);

     // Extrair texto
     const result = await multiLangEngine.extractText(imageBuffer);

     // Verificar se os caracteres especiais foram extraídos corretamente
     expect(result.text).toContain('ção');
     expect(result.text).toContain('ê');
     expect(result.confidence).toBeGreaterThan(70);

     await multiLangEngine.cleanup();
   }, 30000);
   ```

## Notas Adicionais
Este bug afeta principalmente a validação de dados em idiomas não-inglês que contêm caracteres especiais ou acentuação. É especialmente crítico para o mercado brasileiro, onde o português é o idioma principal e contém muitos caracteres acentuados.
