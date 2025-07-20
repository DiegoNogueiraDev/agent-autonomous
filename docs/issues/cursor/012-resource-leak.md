# Problema #012: Vazamento de Recursos do Navegador

## Descrição
O sistema cria múltiplas instâncias de navegadores sem fechá-las adequadamente, resultando em vazamento de recursos. Isto é evidenciado pelos logs que mostram múltiplas inicializações do agente do navegador sem mensagens correspondentes de fechamento ou limpeza.

## Reprodução
1. Executar qualquer comando de validação com múltiplas linhas de CSV
2. Analisar os logs para observar múltiplas inicializações do navegador: `grep "Browser agent initialized" logs/combined.log | wc -l`

## Comportamento Esperado
O sistema deveria:
1. Reutilizar instâncias de navegador quando possível para minimizar o overhead de inicialização
2. Garantir que cada instância de navegador seja adequadamente fechada após o uso
3. Implementar um pool de navegadores para gerenciar eficientemente os recursos

## Comportamento Atual
Conforme observado nos logs, o sistema inicializa repetidamente novas instâncias de navegador sem fechar as anteriores:
```
{"headless":true,"level":"info","message":"Browser agent initialized successfully","ocrFallback":true,"service":"datahawk","timestamp":"2025-07-20T03:17:39.590Z","viewport":{"height":720,"width":1280}}
{"headless":true,"level":"info","message":"Browser agent initialized successfully","ocrFallback":true,"service":"datahawk","timestamp":"2025-07-20T03:17:40.290Z","viewport":{"height":720,"width":1280}}
{"headless":true,"level":"info","message":"Browser agent initialized successfully","ocrFallback":true,"service":"datahawk","timestamp":"2025-07-20T03:17:40.883Z","viewport":{"height":720,"width":1280}}
```

Este comportamento eventualmente leva a erros como:
```
{"error":"browserType.launch: Timeout -1ms exceeded.","level":"error","message":"Failed to initialize browser agent",...}
```

## Impacto
Alto - O vazamento de recursos do navegador pode levar a:
1. Degradação de desempenho após processar múltiplas linhas
2. Falhas completas da aplicação quando o sistema esgota a memória disponível
3. Falhas de inicialização do navegador devido à exaustão de recursos do sistema
4. Potenciais problemas de estabilidade do sistema a longo prazo

## Solução Proposta
1. Implementar um pool de navegadores que limite o número máximo de instâncias simultâneas
2. Garantir que o método `cleanup()` no BrowserAgent seja sempre chamado, possivelmente usando um padrão try-finally
3. Adicionar um mecanismo de limpeza periódica que force o fechamento de instâncias inativas
4. Implementar um monitor de recursos que detecte e corrija vazamentos de navegadores
5. Adicionar uma configuração que permita ao usuário especificar o máximo de instâncias de navegador simultâneas

## Evidência
```
{"headless":true,"level":"info","message":"Browser agent initialized successfully","ocrFallback":true,"service":"datahawk","timestamp":"2025-07-20T03:17:39.590Z","viewport":{"height":720,"width":1280}}
{"headless":true,"level":"info","message":"Browser agent initialized successfully","ocrFallback":true,"service":"datahawk","timestamp":"2025-07-20T03:17:40.290Z","viewport":{"height":720,"width":1280}}
{"headless":true,"level":"info","message":"Browser agent initialized successfully","ocrFallback":true,"service":"datahawk","timestamp":"2025-07-20T03:17:40.883Z","viewport":{"height":720,"width":1280}}
{"error":"browserType.launch: Timeout -1ms exceeded.","level":"error","message":"Failed to initialize browser agent","service":"datahawk","timestamp":"2025-07-20T03:17:39.794Z"}
```

Os logs mostram múltiplas inicializações de navegador em um curto período de tempo sem evidência de fechamento adequado, eventualmente levando a erros de timeout na inicialização de novos navegadores. 