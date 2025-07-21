const http = require('http');

async function testLLM(prompt) {
  console.log(`\n===== TESTANDO LLM =====`);
  console.log(`Prompt: "${prompt}"`);
  
  try {
    // Criar payload para a API LLM
    const payload = JSON.stringify({
      prompt: prompt,
      max_tokens: 100,
      temperature: 0.7,
      stop: ["### End"],
      stream: false
    });
    
    // Enviar para o serviço LLM
    console.log('Enviando prompt para o LLM...');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              console.log('\nResposta LLM:');
              console.log(result.response || result.text || result.output || result.generation);
              resolve(result);
            } catch (err) {
              console.error('Erro ao processar resposta:', err);
              reject(err);
            }
          } else {
            console.error(`Erro ${res.statusCode}:`, data);
            reject(new Error(`Erro ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('Erro na requisição:', error);
        reject(error);
      });
      
      req.write(payload);
      req.end();
    });
    
  } catch (error) {
    console.error('ERRO AO PROCESSAR REQUISIÇÃO LLM:', error.message);
  }
}

// Testando o LLM
async function runTests() {
  // Testando com validação de CSV
  const prompts = [
    "Você é um especialista em validação de CSV. Analise este cabeçalho e me diga se está correto: 'id,name,email,age,status'. Que tipos de dados você esperaria em cada coluna?",
    "Quais são os problemas mais comuns em arquivos CSV e como detectá-los? Liste pelo menos 3 problemas."
  ];
  
  for (const prompt of prompts) {
    try {
      await testLLM(prompt);
    } catch (error) {
      console.error('Erro ao testar LLM:', error);
    }
  }
}

runTests();
