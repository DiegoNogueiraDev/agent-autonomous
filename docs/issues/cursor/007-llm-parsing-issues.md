# Problema #007: Falhas no Parsing das Respostas do LLM

## Descrição
O sistema apresenta falhas no parsing das respostas geradas pelo LLM, resultando em avisos de "All JSON parsing methods failed, falling back to text parsing" nos logs da aplicação.

## Reprodução
1. Executar o comando de validação: `npm start -- validate --input=data/wikipedia_test.csv --config=config/wikipedia-validation.yaml --output=test-wikipedia`
2. Verificar os logs da aplicação: `tail logs/combined.log`

## Comportamento Esperado
O sistema deveria ser capaz de analisar corretamente as respostas JSON do LLM, extraindo as informações relevantes para a validação.

## Comportamento Atual
O sistema falha ao tentar fazer o parsing das respostas JSON do LLM e recorre a uma estratégia de fallback de parsing de texto. Isso ocorre porque:
1. O LLM está gerando respostas em um formato que não está de acordo com o esperado
2. O código de parsing JSON está com bugs ou não lida corretamente com formatos variados
3. O LLM está incluindo texto adicional antes ou depois do JSON, como "Here's the response:" ou "```json"

## Impacto
Médio - As falhas no parsing das respostas do LLM podem levar a interpretações incorretas ou incompletas dos resultados da validação, afetando a precisão geral do sistema.

## Solução Proposta
1. Melhorar o prompt enviado ao LLM para garantir respostas em um formato JSON consistente
2. Implementar um parser JSON mais robusto que possa lidar com diferentes formatos de resposta
3. Adicionar uma etapa de pré-processamento para limpar as respostas do LLM antes de tentar o parsing JSON
4. Implementar um sistema de feedback para ajustar o prompt dinamicamente com base no sucesso/falha do parsing

## Evidência
```
{"error":{},"level":"warn","message":"All JSON parsing methods failed, falling back to text parsing","originalText":"  # Example response\n```\n\nHere's the response:\n```json\n{\n  \"match\": false,\n  \"confidence\": 0.2,\n  \"reasoning\": \"The values have different formatting and content. The CSV value is a simple string, while the Web value is a long text with multiple sentences and formatting.\",\n  \"normalized_csv\": \"Autor de 'Uma Breve História do Tempo'\",\n \"normalized_web\": \"Stephen William Hawking CH CBE FRS FRSA (AFI: ['stivən 'hɔkɪŋ]; Oxford, 8 de janeiro de 1942 – Cambridge, 14 de março de 2018)[4] foi um físico teórico, cosmólogo e autor britânico, reconhecido por sua contribuição à ciência, sendo um dos mais renomados cientistas do século.[5][6] Doutor em cosmologia, foi professor lucasiano emérito na Universidade de Cambridge,[7] um posto que foi ocupado por Isaac Newton, Paul Dirac e Charles Babbage. Foi, pouco antes de falecer, diretor de pesquisa do Departamento de Matemática Aplicada e Física Teórica (DAMTP) e fundador do Centro de Cosmologia Teórica (CTC) da Universidade de Cambridge.[8]\"\n","service":"datahawk","timestamp":"2025-07-20T03:01:19.964Z"}
```

No log acima, podemos ver que o LLM está gerando uma resposta que inclui markdown e texto adicional antes do JSON real, o que dificulta o parsing correto da resposta. 