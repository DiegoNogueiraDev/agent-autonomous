# Problema #008: Processo Não Finaliza Após Completar a Validação

## Descrição
O sistema gera os relatórios de validação corretamente, mas o processo Node.js não finaliza automaticamente, permanecendo em execução indefinidamente.

## Reprodução
1. Executar o comando de validação: `npm start -- validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia`
2. Verificar os processos após a geração de relatórios: `ps aux | grep "node dist/main.js validate"`

## Comportamento Esperado
O processo Node.js deveria finalizar automaticamente após completar a validação e gerar os relatórios, liberando recursos do sistema.

## Comportamento Atual
Mesmo após gerar os arquivos de relatório com sucesso (conforme logs: "Reports generated successfully"), o processo principal continua em execução indefinidamente, consumindo recursos do sistema.

## Impacto
Médio - O processo em execução contínua consome recursos do sistema (memória e CPU) e pode causar confusão ao usuário, que pode não perceber que a validação já foi concluída, especialmente em execuções em background ou via scripts automatizados.

## Solução Proposta
1. Adicionar uma chamada explícita a `process.exit(0)` após a conclusão bem-sucedida do processo
2. Verificar se existem recursos que não estão sendo liberados corretamente (como conexões com bancos de dados, handlers de eventos, etc.)
3. Implementar um mecanismo de timeout que force a finalização do processo após um período de inatividade pós-geração de relatórios
4. Adicionar uma flag de linha de comando `--keep-alive` para os casos em que o usuário deseja explicitamente manter o processo em execução

## Evidência
O processo continua em execução mesmo após gerar os relatórios com sucesso:
```
$ ps aux | grep "node dist/main.js validate"
diego      88363  0.0  0.0   2588  1364 pts/6    S+   jul19   0:00 sh -c node dist/main.js validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia
diego      88364  1.4  1.3 22984560 215780 pts/6 Sl+  jul19   0:08 node dist/main.js validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia
```

Os logs mostram que a geração de relatórios foi concluída com sucesso:
```
{"files":["test-wikipedia/datahawk-report-2025-07-20T03-04-30.json","test-wikipedia/datahawk-report-2025-07-20T03-04-30.html"],"formats":["json","html"],"level":"info","message":"Reports generated successfully","service":"datahawk","timestamp":"2025-07-20T03:04:30.503Z"}
``` 