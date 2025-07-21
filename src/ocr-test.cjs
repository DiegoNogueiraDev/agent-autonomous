const fs = require('fs').promises;
const path = require('path');
const http = require('http');

async function testOCR(imagePath) {
  console.log(`\n===== TESTANDO OCR com ${imagePath} =====`);
  
  try {
    // Verificar se o arquivo existe
    try {
      await fs.access(imagePath);
    } catch (error) {
      console.error(`Arquivo não encontrado: ${imagePath}`);
      return;
    }
    
    // Ler o arquivo como base64
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Criar payload para a API OCR
    const payload = JSON.stringify({
      image: base64Image,
      options: {
        language: 'por+eng',
        preprocessing: {
          grayscale: true,
          denoise: true,
          contrast: 1.5
        }
      }
    });
    
    // Enviar para o serviço OCR
    console.log('Enviando imagem para processamento OCR...');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/process',
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
              console.log('Resultado OCR:');
              console.log('- Texto extraído:', result.text.substring(0, 100) + '...');
              console.log('- Confiança:', result.confidence);
              console.log('- Tempo de processamento:', result.processing_time_ms, 'ms');
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
    console.error('ERRO AO PROCESSAR IMAGEM:', error.message);
  }
}

// Testando arquivos de imagem
async function runTests() {
  // Procurando algumas imagens no sistema para teste
  const testImages = [
    '../images/logo/datahawk_logo.png',
    '../tests/fixtures/sample_image.png',
    '../tests/fixtures/receipt.jpg'
  ];
  
  for (const img of testImages) {
    try {
      // Verifica se o arquivo existe antes de testar
      try {
        await fs.access(img);
        await testOCR(img);
      } catch (err) {
        console.log(`Arquivo não encontrado: ${img}, pulando...`);
      }
    } catch (error) {
      console.error('Erro ao testar imagem:', error);
    }
  }
}

runTests();
