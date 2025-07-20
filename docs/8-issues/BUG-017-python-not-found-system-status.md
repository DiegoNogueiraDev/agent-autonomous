# BUG-017: Python não encontrado no system status

## Descrição
O comando `node dist/main.js status` não consegue encontrar o Python no sistema, mesmo o Python estando instalado.

## Reprodução
1. Executar `node dist/main.js status`
2. Resultado mostra "Python: Not found ❌"
3. Erro: `/bin/sh: 1: python: not found`

## Impacto
- Médio - funcionalidade status reporting incorreta
- Pode confundir usuários sobre dependências do sistema
- Status check não reflete realidade do ambiente

## Análise
O comando está procurando por `python` mas pode estar disponível como `python3`. Muitos sistemas Linux modernos só têm `python3` instalado por padrão.

## Investigação
```bash
$ which python
# (não encontrado)
$ which python3
# /usr/bin/python3 (provavelmente disponível)
```

## Localização
Comando status no main.js

## Prioridade
🟡 Média - Não impede funcionamento principal

## Status
🔴 Aberto

## Reportado em
2025-07-20T04:XX:XX

## Tipo de Teste
- [x] Funcionalidade Básica
- [ ] Comportamento do Usuário  
- [ ] Integração
- [ ] Massivo/Stress