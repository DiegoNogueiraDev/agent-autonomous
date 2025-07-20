# 🐞 Registro de Bugs Identificados

Este diretório contém a documentação dos bugs identificados durante os testes do DataHawk Autonomous QA.

## Estrutura

Cada bug identificado é documentado em um arquivo separado neste diretório com o seguinte formato:

- `BUG-XXX-titulo-descritivo.md`: Onde XXX é um número sequencial e o título descreve brevemente o problema

## Lista de Bugs

| ID | Título | Status | Gravidade | Data |
|----|--------|--------|-----------|------|
| BUG-001 | [Falha no Formato de Resposta do Servidor LLM](BUG-001-formato-resposta-llm.md) | Corrigido | Alta | 2025-07-20 |
| BUG-002 | [Incompatibilidade entre Endpoints do Servidor LLM e Cliente](BUG-002-incompatibilidade-endpoints-llm.md) | Corrigido | Alta | 2025-07-20 |
| BUG-003 | [Falha no Tratamento de Caracteres Especiais e Multibyte](BUG-003-problemas-caracteres-especiais.md) | Corrigido | Média | 2025-07-20 |
| BUG-004 | [Timeout em Testes de Carga com Textos Extensos](BUG-004-timeout-testes-carga.md) | Corrigido | Média | 2025-07-20 |
| BUG-005 | [Vazamento de Memória no BrowserAgent](BUG-005-memory-leak-browser-agent.md) | Corrigido | Alta | 2025-07-20 |
| BUG-006 | [Duplicação de Código Entre BrowserAgent e EnhancedBrowserAgent](BUG-006-duplicacao-codigo-browser-agents.md) | Corrigido | Média | 2025-07-20 |
| BUG-007 | [Falha na Inicialização do OCR com Múltiplos Idiomas](BUG-007-dependencia-tesseract-multilanguage.md) | Corrigido | Alta | 2025-07-20 |
| BUG-008 | [Falhas no ResourceManager Durante Interrupção Abrupta](BUG-008-resource-manager-falhas.md) | Corrigido | Alta | 2025-07-20 |
| BUG-009 | [Incompatibilidade entre Esquema de Validação e Arquivos de Configuração YAML](BUG-009-incompatibilidade-config-schema-validacao.md) | Corrigido | Alta | 2025-07-20 |
| BUG-010 | [Falta de Validação de Configuração no TaskmasterController](BUG-010-falta-validacao-taskmaster.md) | Corrigido | Alta | 2025-07-20 |
| BUG-011 | [Truncamento de Dados em Relatórios HTML com Objetos Grandes](BUG-011-relatorio-html-truncado-objetos-grandes.md) | Corrigido | Média | 2025-07-20 |
| BUG-012 | [Falha na Limpeza de Arquivos Temporários de Evidência](BUG-012-falha-limpeza-arquivos-temporarios.md) | Corrigido | Média | 2025-07-20 |
| BUG-013 | [Falha no Tratamento de Erros do Singleton Logger e Gestão de Arquivos de Log](BUG-013-falha-tratamento-erro-singleton-logger.md) | Corrigido | Média | 2025-07-20 |
| BUG-014 | [Inconsistências no Script de Validação do Sistema](BUG-014-inconsistencia-validate-system.md) | Parcialmente Corrigido | Baixa | 2025-07-20 |
| BUG-015 | [Falha nos Testes E2E Durante Execução com Múltiplas Instâncias](BUG-015-falha-testes-e2e-multiplas-instancias.md) | Em Andamento | Média | 2025-07-20 |

## Instruções para Documentação

Ao documentar um novo bug, utilize o modelo abaixo:

```markdown
# BUG-XXX: Título Descritivo do Bug

## Descrição
Descrição detalhada do problema.

## Passos para Reprodução
1. Passo 1
2. Passo 2
3. Passo 3

## Comportamento Esperado
Descrição do comportamento esperado.

## Comportamento Atual
Descrição do comportamento atual com o bug.

## Ambiente
- OS:
- Versão do Node:
- Versão do Python:
- Outros detalhes relevantes:

## Evidências
Screenshots, logs ou outros dados que demonstrem o bug.

## Possível Solução
Se houver sugestão de como corrigir o problema.

## Notas Adicionais
Qualquer informação adicional relevante.
```
