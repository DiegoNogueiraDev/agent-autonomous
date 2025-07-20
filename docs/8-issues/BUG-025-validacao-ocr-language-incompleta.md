# BUG-025: Validação Incompleta de OCRSettings.language

## Descrição
A validação de linguagem do OCR no método `validateSettings` do OCREngine não verifica corretamente se os arquivos de dados de treinamento estão disponíveis no sistema antes de inicializar o OCR. Isso causa falhas durante a execução quando uma linguagem especificada não tem seus arquivos `.traineddata` instalados.

## Reprodução
1. Configurar o OCREngine com uma linguagem que não possui arquivo traineddata (ex: "jpn" sem ter o arquivo jpn.traineddata)
2. Inicializar o OCREngine
3. Observar que a inicialização parece bem-sucedida
4. Tentar executar extração de texto e receber erro específico do Tesseract

## Impacto
- Alto - falha silenciosa que só é detectada durante a execução
- Causa falsos positivos durante a validação de configuração
- Mensagens de erro crípticas para o usuário final

## Análise
O método `validateSettings` em `OCREngine` apenas verifica se a string de linguagem está formatada corretamente, mas não verifica a existência dos arquivos de dados necessários:

```typescript
static validateSettings(settings: OCRSettings): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validação atual apenas verifica o formato, não a existência
  if (!settings.language || !/^[a-z]{3}(\+[a-z]{3})*$/.test(settings.language)) {
    errors.push('Invalid language format. Use ISO 639-2 format (e.g., "eng", "por", "eng+por").');
  }

  // Falta verificação da existência dos arquivos .traineddata

  return {
    valid: errors.length === 0,
    errors
  };
}
```

Além disso, a classe OCREngine não implementa fallback para idiomas não disponíveis, o que resulta em falhas em cenários multilíngues.

## Localização
`src/ocr/ocr-engine.ts` - método `validateSettings` e `initialize`

## Prioridade
🟠 Alta - Causa falha em execução para configurações inválidas

## Status
🔴 Aberto

## Reportado em
2025-07-21T08:XX:XX

## Tipo de Teste
- [x] Funcionalidade Básica
- [ ] Comportamento do Usuário
- [ ] Integração
- [ ] Massivo/Stress

## Solução Proposta
1. Adicionar verificação da existência dos arquivos de dados no método de validação:

```typescript
static async validateSettings(settings: OCRSettings): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Validação de formato
  if (!settings.language || !/^[a-z]{3}(\+[a-z]{3})*$/.test(settings.language)) {
    errors.push('Invalid language format. Use ISO 639-2 format (e.g., "eng", "por", "eng+por").');
  } else {
    // Verificação da existência dos arquivos
    const languages = settings.language.split('+');
    for (const lang of languages) {
      try {
        // Verificar se o arquivo .traineddata existe
        const trainedDataPath = `${process.cwd()}/${lang}.traineddata`;
        await fs.promises.access(trainedDataPath, fs.constants.F_OK);
      } catch (error) {
        errors.push(`Language data file not found: ${lang}.traineddata`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

2. Implementar fallback para inglês quando um idioma não estiver disponível
3. Adicionar mensagens de erro amigáveis
4. Adicionar instrução para download dos arquivos de treinamento ausentes
