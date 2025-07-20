# BUG-009: Incompatibilidade entre Esquema de Validação e Arquivos de Configuração YAML

## Descrição
Existe uma incompatibilidade estrutural entre o esquema de validação definido em `ConfigManager` (usando Zod) e os arquivos de configuração YAML. As chaves usadas no esquema de validação (formato camelCase) não correspondem às chaves utilizadas nos arquivos de configuração reais (formato snake_case). Isso causa falhas de validação ao carregar configurações válidas e impede o uso correto do sistema de validação.

## Passos para Reprodução
1. Analisar os arquivos `src/core/config-manager.ts` e `config/validation.yaml`
2. Tentar carregar uma configuração utilizando o `ConfigManager`
3. Observar que a validação falha mesmo com arquivos de configuração válidos

## Comportamento Esperado
O esquema de validação em `ConfigManager` deve utilizar o mesmo padrão de nomenclatura dos arquivos de configuração YAML, permitindo validação e carregamento corretos.

## Comportamento Atual
Analisando o código do arquivo `src/core/config-manager.ts`, vemos que ele define o esquema de validação com nomes em camelCase:

```typescript
const ValidationConfigSchema = z.object({
  targetUrl: z.string().url(),
  fieldMappings: z.array(FieldMappingSchema),
  validationRules: z.object({
    confidence: z.object({
      minimumOverall: z.number().min(0).max(1),
      minimumField: z.number().min(0).max(1),
      ocrThreshold: z.number().min(0).max(1),
      fuzzyMatchThreshold: z.number().min(0).max(1)
    }),
    // ...mais propriedades em camelCase
  })
});
```

Porém, os arquivos de configuração YAML utilizam snake_case:

```yaml
# config/validation.yaml
confidence:
  minimum_overall: 0.8
  minimum_field: 0.7
  ocr_threshold: 0.6
  fuzzy_match_threshold: 0.85

fuzzy_matching:
  enabled: true
  string_similarity_threshold: 0.85
  # ...mais propriedades em snake_case
```

Além disso, a estrutura hierárquica é diferente. No esquema, temos `validationRules.confidence.minimumOverall`, enquanto no YAML temos apenas `confidence.minimum_overall`.

## Ambiente
- TypeScript: versão no package.json
- YAML Parser: biblioteca 'yaml'
- Zod: versão no package.json

## Evidências
1. O código atual para testar uma configuração inválida falha pelos motivos errados:
```typescript
// config/invalid-config.yaml usa snake_case e estrutura diferente
// vs.
// ValidationConfigSchema espera camelCase e estrutura aninhada
```

2. A função `generateSampleConfig` no ConfigManager está comentada devido a problemas de tipo, que provavelmente estão relacionados a esta inconsistência.

3. A incompatibilidade estrutural também é evidente:
   - O esquema espera `validationRules.confidence.minimumOverall`
   - O YAML fornece diretamente `confidence.minimum_overall`

## Possível Solução
1. **Normalizar nomes de propriedades antes da validação**:
   ```typescript
   async loadValidationConfig(configPath: string): Promise<ValidationConfig> {
     try {
       const configContent = await readFile(configPath, 'utf-8');
       const rawConfig = parseYaml(configContent);

       // Normalizar nomes de propriedades de snake_case para camelCase
       const normalizedConfig = this.normalizeConfigKeys(rawConfig);

       // Reestruturar para corresponder ao esquema esperado
       const restructuredConfig = this.restructureConfig(normalizedConfig);

       // Validar configuração normalizada
       const validatedConfig = ValidationConfigSchema.parse(restructuredConfig);

       return validatedConfig as ValidationConfig;
     } catch (error) {
       // Tratamento de erro existente
     }
   }

   private normalizeConfigKeys(obj: Record<string, any>): Record<string, any> {
     const result: Record<string, any> = {};

     for (const [key, value] of Object.entries(obj)) {
       // Converter snake_case para camelCase
       const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

       // Recursivamente normalizar objetos aninhados
       result[camelKey] = typeof value === 'object' && value !== null
         ? this.normalizeConfigKeys(value)
         : value;
     }

     return result;
   }

   private restructureConfig(config: Record<string, any>): Record<string, any> {
     // Reestruturar configuração para corresponder ao esquema esperado
     const result: Record<string, any> = {
       targetUrl: config.targetUrl,
       fieldMappings: config.fieldMappings || [],
       validationRules: {
         confidence: config.confidence || {},
         fuzzyMatching: config.fuzzyMatching || {},
         normalization: config.normalization || {},
         errorHandling: config.errorHandling || {}
       },
       performance: config.performance || {},
       evidence: config.evidence || {}
     };

     return result;
   }
   ```

2. **Alternativa: Atualizar o esquema de validação**:
   ```typescript
   // Atualizar o esquema para corresponder à estrutura do YAML
   const ValidationConfigSchema = z.object({
     targetUrl: z.string().url(),
     fieldMappings: z.array(FieldMappingSchema),
     confidence: z.object({
       minimum_overall: z.number().min(0).max(1),
       minimum_field: z.number().min(0).max(1),
       ocr_threshold: z.number().min(0).max(1),
       fuzzy_match_threshold: z.number().min(0).max(1)
     }),
     fuzzy_matching: z.object({
       enabled: z.boolean(),
       // ...outras propriedades
     }),
     // ...outros campos
   });

   // Converter para o formato interno após validação
   const validatedConfig = ValidationConfigSchema.parse(rawConfig);
   const internalConfig: ValidationConfig = {
     targetUrl: validatedConfig.targetUrl,
     fieldMappings: validatedConfig.fieldMappings,
     validationRules: {
       confidence: {
         minimumOverall: validatedConfig.confidence.minimum_overall,
         minimumField: validatedConfig.confidence.minimum_field,
         ocrThreshold: validatedConfig.confidence.ocr_threshold,
         fuzzyMatchThreshold: validatedConfig.confidence.fuzzy_match_threshold
       },
       // ...outras propriedades convertidas
     },
     // ...outros campos convertidos
   };
   ```

3. **Documentar o formato esperado**:
   Atualizar a documentação para especificar claramente o formato e estrutura esperados para arquivos de configuração.

## Notas Adicionais
Esta incompatibilidade dificulta a criação de novas configurações, pois o sistema rejeitará configurações que parecem válidas para o usuário. O problema também aumenta a complexidade de manutenção do código, pois requer conversões manuais entre os formatos camelCase e snake_case.
