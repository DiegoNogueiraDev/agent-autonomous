# Bug #001: Chaves duplicadas no arquivo de configuração validation.yaml

## Descrição
Foi identificada uma chave duplicada no arquivo de configuração `validation.yaml`. O sistema não consegue carregar a configuração devido a essa duplicação.

## Erro
```
Failed to load configuration: Map keys must be unique at line 140, column 3:

  hybrid:
  ^
```

## Passos para reprodução
1. Execute o comando de validação usando o arquivo de configuração `validation.yaml`:
```bash
node dist/main.js validate --input data/test-invalid.csv --config config/validation.yaml --output data/qa-results/test-invalid --format json,html
```

## Impacto
- O aplicativo não consegue iniciar o processo de validação
- Todas as validações que utilizam este arquivo de configuração falharão

## Gravidade
Alta - Impede totalmente o uso do sistema com este arquivo de configuração

## Solução sugerida
Revisar o arquivo `config/validation.yaml` aproximadamente na linha 140 e remover ou renomear a entrada duplicada `hybrid:`.

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
