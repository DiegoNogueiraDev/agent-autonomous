# Bug #006: Servidor LLM não iniciado automaticamente

## Descrição
O sistema falha ao tentar validar dados quando o servidor LLM não está em execução. Em vez de iniciar o servidor automaticamente ou fornecer instruções claras de recuperação, o processo falha completamente.

## Erro
```
Failed to initialize LLM engine: LLM server not running. Please start it with: python3 llm-server.py
```

## Passos para reprodução
1. Certifique-se que o servidor LLM não está em execução
2. Execute o comando de validação com qualquer arquivo de dados válido:
```bash
node dist/main.js validate --input data/test-large.csv --config config/complete-validation.yaml --output data/qa-results/test-large --max-rows 10 --format json,html
```

## Análise
O processo de validação requer que o servidor LLM esteja em execução, porém:
- O sistema detecta que o servidor não está rodando
- Menciona que vai tentar iniciar o servidor (`warn: LLM server not running, will attempt to start it`)
- No entanto, falha em iniciar o servidor automaticamente
- O processo é interrompido com um erro, exigindo intervenção manual

Isso é contraditório com a mensagem de log que indica que o sistema tentará iniciar o servidor, mas na prática não consegue fazê-lo.

## Impacto
- Interrupção do fluxo de testes automatizados
- Necessidade de intervenção manual para iniciar o servidor LLM
- Experiência de usuário confusa com mensagens conflitantes

## Gravidade
Alta - Impede completamente o uso do sistema sem intervenção manual

## Solução sugerida
1. Implementar inicialização automática do servidor LLM quando ele não estiver em execução:
```typescript
// Em local-llm-engine.ts
async initialize() {
  try {
    // Tentar conectar ao servidor existente
    // ...
  } catch (error) {
    // Se não estiver rodando, iniciar automaticamente
    this.logger.info('Starting LLM server automatically...');

    const { spawn } = await import('child_process');
    const llmServer = spawn('python3', ['llm-server.py'], {
      detached: true,
      stdio: 'ignore'
    });

    // Aguardar inicialização
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Tentar conectar novamente
    // ...
  }
}
```

2. Adicionar uma flag de linha de comando para controlar este comportamento:
```
--auto-start-llm=true|false
```

3. Melhorar as mensagens de erro com instruções mais claras sobre como resolver o problema

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
