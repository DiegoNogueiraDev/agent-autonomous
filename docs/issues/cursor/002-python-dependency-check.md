# Problema #002: Detecção de Python Falha

## Descrição
O sistema não detecta corretamente a instalação do Python no ambiente. Durante os testes, ao executar o comando de status, o sistema reporta que o Python não foi encontrado, mesmo quando está instalado e disponível no sistema.

## Reprodução
1. Executar o comando: `npm start -- status`
2. O sistema retorna: `Python: Not found ❌`

## Comportamento Esperado
O sistema deveria detectar corretamente a instalação do Python e exibir a versão instalada.

## Comportamento Atual
O sistema tenta executar o comando `python --version` mas não consegue encontrar o interpretador Python, possivelmente porque está procurando pelo comando "python" enquanto o sistema pode estar usando "python3" como comando padrão.

## Impacto
Médio - A falha na detecção do Python pode levar o usuário a acreditar que o requisito não está atendido, mesmo quando está. Além disso, pode causar falhas em funções que dependem do Python, como o servidor LLM.

## Solução Proposta
Modificar a função de verificação de status no arquivo `src/main.ts` para tentar múltiplos comandos:
1. Tentar primeiro `python --version`
2. Se falhar, tentar `python3 --version`
3. Se ambos falharem, reportar que o Python não foi encontrado

## Evidência
```
Node.js: v22.17.1 ✅
/bin/sh: 1: python: not found
Python: Not found ❌
``` 