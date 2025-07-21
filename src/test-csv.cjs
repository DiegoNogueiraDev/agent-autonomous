const fs = require('fs').promises;
const path = require('path');

// Importações simplificadas, simulando a API básica do CSVLoader para testes
class CSVLoader {
  async validateCsvFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const errors = [];
      
      // Verifica se o arquivo está vazio
      if (lines.length === 0) {
        errors.push('Arquivo vazio');
        return { valid: false, errors };
      }
      
      // Analisa a estrutura básica
      const delimiter = ','; // Assumindo CSV com vírgula
      const headerCols = lines[0].split(delimiter).length;
      
      // Verifica consistência no número de colunas
      for (let i = 1; i < Math.min(lines.length, 10); i++) {
        const cols = lines[i].split(delimiter).length;
        if (Math.abs(cols - headerCols) > 1) {
          errors.push(`Inconsistência no número de colunas na linha ${i+1}: ${cols} vs ${headerCols} esperadas`);
        }
      }
      
      // Verifica problemas com aspas
      const quoteRegex = /"([^"]|"")*"/g;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        let matches = line.match(/"/g) || [];
        if (matches.length % 2 !== 0) {
          errors.push(`Problema com aspas na linha ${i+1}: número ímpar de aspas`);
        }
      }
      
      return { 
        valid: errors.length === 0, 
        errors 
      };
    } catch (error) {
      return { 
        valid: false, 
        errors: [`Erro ao ler arquivo: ${error.message}`] 
      };
    }
  }
  
  async load(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      const rows = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        // Implementação simplificada para testes - não lida com todos os casos de CSV
        const values = lines[i].split(',');
        const row = {};
        
        headers.forEach((header, index) => {
          let value = values[index] || '';
          // Remove aspas se existirem
          value = value.replace(/^"(.*)"$/, '$1');
          row[header] = value;
        });
        
        rows.push(row);
      }
      
      return { 
        rows,
        headers,
        metadata: {
          rowCount: rows.length,
          fileName: path.basename(filePath)
        }
      };
    } catch (error) {
      throw new Error(`Falha ao carregar CSV: ${error.message}`);
    }
  }
}

async function testCSV(filepath) {
  console.log(`\n\n===== TESTANDO ${filepath} =====`);
  const csvLoader = new CSVLoader();
  
  try {
    // Teste de validação
    console.log('Validando arquivo...');
    const validation = await csvLoader.validateCsvFile(filepath);
    console.log('Resultado da validação:', validation);
    
    if (!validation.valid) {
      console.log('Erros de validação:', validation.errors);
    }
    
    // Carregando o arquivo
    console.log('\nCarregando arquivo...');
    const start = Date.now();
    const data = await csvLoader.load(filepath);
    const end = Date.now();
    
    console.log(`Arquivo carregado em ${end - start}ms`);
    console.log(`Total de linhas: ${data.rows.length}`);
    console.log('Primeiras 2 linhas:', data.rows.slice(0, 2));
    
  } catch (error) {
    console.error('ERRO AO PROCESSAR ARQUIVO:', error.message);
  }
}

// Lista de arquivos para testar
const files = [
  '../data/sample.csv',
  '../data/corrupted-test.csv', 
  '../data/test-invalid.csv'
];

async function runTests() {
  for (const file of files) {
    await testCSV(file);
  }
}

runTests();
