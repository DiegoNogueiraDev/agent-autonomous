# Issue 001: Schema de Validação de Configuração Incompatível

## Problema Identificado
O schema de validação do arquivo `validation.yaml` está rejeitando configurações válidas devido a divergências entre o schema esperado e o formato real dos arquivos YAML.

## Detalhes Técnicos
- **Arquivo afetado**: `src/core/config-manager.ts`
- **Erro específico**: `Configuration validation failed: fieldMappings.0.fieldType: Invalid enum value. Expected 'text' | 'email' | 'phone' | 'currency' | 'date' | 'name' | 'address' | 'number' | 'boolean', received 'string'`
- **Testes falhando**: Todos os testes em `tests/unit/config-manager.test.ts`

## Impacto
- Impossibilidade de carregar configurações YAML válidas
- Falha em 7/10 suites de teste
- 89 testes falhando no total

## Campos Problemáticos
1. `fieldType` aceita 'string' mas schema espera tipos específicos
2. `validationStrategy` é obrigatório mas não está presente
3. `validationRules.confidence.*` campos obrigatórios ausentes
4. `performance.*` seções obrigatórias ausentes
5. `evidence.*` configurações obrigatórias ausentes

## Solução Proposta
1. Atualizar o schema Zod em `src/core/config-manager.ts` para aceitar 'string' como valor válido para fieldType
2. Tornar campos opcionais com valores padrão apropriados
3. Atualizar arquivos de configuração de exemplo para incluir todos campos obrigatórios
4. Adicionar validação mais flexível que permita configurações parciais

## Arquivos para Atualizar
- `src/core/config-manager.ts`
- `config/validation.yaml`
- `config/sample-validation.yaml`
- Adicionar migration script para configs antigas
