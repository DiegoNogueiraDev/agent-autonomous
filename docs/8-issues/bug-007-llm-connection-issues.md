# Bug #007: Problemas de conexão com o servidor LLM

## Descrição
O servidor LLM está em execução (verificado via curl), mas o sistema DataHawk não consegue conectar-se a ele, resultando em falha durante a validação. A classe LocalLLMEngine tenta conectar-se ao servidor, mas falha mesmo quando o servidor está ativo e respondendo corretamente.

## Erro
```
Failed to initialize LLM engine: LLM server not running. Please start it with: python3 llm-server.py
```

## Passos para reprodução
1. Inicie o servidor LLM com `python3 llm-server.py`
2. Verifique que o servidor está funcionando com `curl http://127.0.0.1:8000/health`
3. Execute um comando de validação:
```bash
node dist/main.js validate --input data/special-chars-test.csv --config config/special-chars-test.yaml --output data/qa-results/special-chars --max-rows 5 --format json,html
```
4. Observe que o sistema falha em se conectar ao servidor LLM mesmo estando em execução

## Análise
A investigação revelou que:
1. O servidor LLM está em execução e respondendo corretamente (confirmado via curl)
2. A classe `LocalLLMEngine` tenta verificar a disponibilidade do servidor através de vários URLs, mas não está detectando o servidor ativo
3. A lógica de detecção do servidor não está tratando adequadamente as respostas ou tem algum problema no processamento da resposta HTTP

O código fonte indica que existe uma verificação dos servidores usando vários endpoints (`http://localhost:8000/health`, `http://127.0.0.1:8000/health`, etc.), mas o sistema não está conseguindo detectar a resposta positiva.

## Impacto
- Impossibilidade de utilizar o sistema mesmo com o servidor LLM em execução
- Necessidade de depuração manual para identificar o problema
- Experiência de usuário ruim com mensagens de erro incorretas

## Gravidade
Alta - Impede totalmente o uso do sistema mesmo quando o servidor LLM está corretamente em execução

## Solução sugerida
1. Adicionar mais logs de depuração na função `checkLLMServer()` para identificar exatamente onde está a falha:
```typescript
private async checkLLMServer(): Promise<boolean> {
  const serverUrls = [
    'http://localhost:8000/health',
    'http://127.0.0.1:8000/health',
    'http://localhost:8080/health',
    'http://127.0.0.1:8080/health'
  ];

  for (const url of serverUrls) {
    try {
      this.logger.debug(`Checking LLM server at ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      this.logger.debug(`Server at ${url} responded with status ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        this.logger.debug(`Server response: ${JSON.stringify(data)}`);

        if (data.status === 'healthy') {
          this.workingServerUrl = url.replace('/health', '');
          this.logger.info(`Found working LLM server at ${this.workingServerUrl}`);
          return true;
        }
      }
    } catch (error) {
      this.logger.debug(`Error checking server at ${url}: ${error.message}`);
    }
  }

  return false;
}
```

2. Implementar um mecanismo de retry com delay incremental:
```typescript
private async retryServerCheck(maxAttempts: number = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    this.logger.info(`Attempt ${attempt}/${maxAttempts} to find LLM server`);

    if (await this.checkLLMServer()) {
      return true;
    }

    // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
  }

  return false;
}
```

## Ambiente
- Node.js v18+
- DataHawk versão 1.2.0
- Linux 6.12.32+bpo-amd64
- Servidor LLM em execução (confirmado via curl)
