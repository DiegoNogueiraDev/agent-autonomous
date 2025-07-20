# Issue 002: Métodos de Configuração Ausentes

## Problema Identificado
Os métodos `mergeConfigs` e `saveValidationConfig` estão sendo chamados nos testes mas não existem na implementação da classe `ConfigManager`.

## Detalhes Técnicos
- **Arquivo afetado**: `src/core/config-manager.ts`
- **Erro específico**: `TypeError: configManager.mergeConfigs is not a function`
- **Testes falhando**: `ConfigManager › configuration merging` e `ConfigManager › configuration saving`

## Métodos Ausentes
1. `mergeConfigs(baseConfig, overrideConfig)` - para mesclar múltiplas fontes de configuração
2. `saveValidationConfig(filePath, config)` - para salvar configurações em arquivo YAML

## Impacto
- Impossibilidade de mesclar configurações de múltiplas fontes
- Impossibilidade de salvar configurações modificadas
- Falha em testes de integração que dependem desses métodos

## Solução Proposta
1. Implementar o método `mergeConfigs` com lógica de deep merge
2. Implementar o método `saveValidationConfig` com validação antes de salvar
3. Adicionar testes unitários para os novos métodos
4. Garantir compatibilidade com formato YAML existente

## Implementação Sugerida
```typescript
// Adicionar à classe ConfigManager
public mergeConfigs(baseConfig: ValidationConfig, overrideConfig: Partial<ValidationConfig>): ValidationConfig {
  return {
    ...baseConfig,
    ...overrideConfig,
    fieldMappings: [...baseConfig.fieldMappings, ...overrideConfig.fieldMappings || []],
    validationRules: { ...baseConfig.validationRules, ...overrideConfig.validationRules },
    performance: { ...baseConfig.performance, ...overrideConfig.performance },
    evidence: { ...baseConfig.evidence, ...overrideConfig.evidence }
  };
}

public async saveValidationConfig(filePath: string, config: ValidationConfig): Promise<void> {
  const validatedConfig = this.validationSchema.parse(config);
  const yamlContent = yaml.dump(validatedConfig, { indent: 2 });
  await fs.writeFile(filePath, yamlContent, 'utf-8');
}
```

## Arquivos para Atualizar
- `src/core/config-manager.ts`
- `tests/unit/config-manager.test.ts` (adicionar testes para novos métodos)
