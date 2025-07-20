# BUG-003: Falha no Tratamento de Caracteres Especiais e Multibyte

## Descrição
O sistema apresenta falhas ao validar textos que contêm caracteres especiais, como acentuação, caracteres multibyte (chinês, japonês, etc.), emojis e HTML entities. Os testes que envolvem esses caracteres estão falhando consistentemente.

## Passos para Reprodução
1. Iniciar o servidor LLM com `python3 llm-server.py`
2. Executar os testes específicos para caracteres especiais:
   ```bash
   npx jest --testMatch="**/tests/unit/complex-llm-test.ts" -t "caracteres especiais"
   ```
3. Observar que todos os testes falham mesmo quando os valores comparados são idênticos

## Comportamento Esperado
O sistema deveria reconhecer corretamente quando dois textos são idênticos ou equivalentes, mesmo contendo:
- Acentuação e caracteres especiais (ç, é, ã, etc.)
- Caracteres CJK (chinês, japonês, coreano)
- Emojis (🚀, 😊, etc.)
- HTML entities (&amp; equivalente a &)
- Caracteres de escape (\n, \t, etc.)

## Comportamento Atual
Todos os testes com caracteres especiais estão falhando:
```
● LocalLLMEngine - Cenários Complexos › Validação com caracteres especiais › deve lidar com acentuação portuguesa
● LocalLLMEngine - Cenários Complexos › Validação com caracteres especiais › deve lidar com caracteres chineses
● LocalLLMEngine - Cenários Complexos › Validação com caracteres especiais › deve lidar com emojis
● LocalLLMEngine - Cenários Complexos › Validação com caracteres especiais › deve lidar com HTML entities
● LocalLLMEngine - Cenários Complexos › Validação com caracteres especiais › deve lidar com caracteres de escape
```

Mesmo quando os valores são idênticos, o sistema está indicando que não há correspondência:
```
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
```

## Ambiente
- OS: Linux 6.12.32+bpo-amd64
- Node.js: v18+
- Python: 3.8+
- Modelo: llama3-8b-instruct.Q4_K_M.gguf

## Evidências
Além dos resultados dos testes, uma análise do código mostra que o problema pode estar relacionado a:

1. Codificação incorreta de caracteres na comunicação entre o cliente e o servidor
2. Falta de normalização adequada dos textos antes da comparação
3. Problemas na serialização/deserialização JSON de caracteres multibyte

Exemplo de teste que está falhando:
```typescript
{
  desc: 'acentuação portuguesa',
  csvValue: 'João da Silva Açaí',
  webValue: 'João da Silva Açaí',
  expect: true
}
```

## Possível Solução
1. **Normalização Adequada**: Implementar normalização Unicode antes da comparação
   ```typescript
   private normalizeForComparison(value: string): string {
     if (!value) return '';

     // Normaliza para forma NFC (composição canônica)
     return value
       .normalize('NFC')
       .trim()
       .toLowerCase();
   }
   ```

2. **Sanitização de HTML Entities**:
   ```typescript
   function decodeHtmlEntities(text: string): string {
     return text
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&nbsp;/g, ' ');
   }
   ```

3. **Tratamento de Escapes**:
   ```typescript
   function processEscapeSequences(text: string): string {
     return text
       .replace(/\\n/g, '\n')
       .replace(/\\t/g, '\t')
       .replace(/\\r/g, '\r');
   }
   ```

4. **Codificação Adequada na Comunicação**: Garantir que as requisições HTTP entre cliente e servidor usem encoding adequado:
   ```typescript
   const response = await fetch(`${baseUrl}/validate`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json; charset=utf-8'
     },
     body: JSON.stringify({
       csv_value: request.csvValue,
       web_value: request.webValue,
       field_type: request.fieldType,
       field_name: request.fieldName
     })
   });
   ```

5. **Configuração do Servidor LLM**:
   ```python
   # No servidor Python, garantir que o Flask use UTF-8:
   app = Flask(__name__)
   app.config['JSON_AS_ASCII'] = False  # Isso permite caracteres não-ASCII no JSON
   ```

## Notas Adicionais
Este problema tem impacto significativo na validação de dados em idiomas diferentes do inglês e conteúdo web que frequentemente contém HTML entities e outros caracteres especiais. Sua correção é prioritária para garantir que o sistema funcione corretamente com dados do mundo real.
