#!/usr/bin/env node

/**
 * Script de validação para testar as correções dos bugs críticos
 *
 * BUG-023: Timeout de navegação em sites gov.br
 * BUG-024: Parâmetros de URL não são substituídos
 * BUG-025: Timeout em sites externos
 * BUG-026: Falha de comunicação Node.js ↔ LLM Server
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configurações de teste
const TEST_CASES = [
  {
    name: 'gov-br-test',
    description: 'Teste de navegação em sites gov.br',
    command: 'node dist/main.js validate --input data/gov-br-test.csv --config config/gov-br-test.yaml --output test-gov-br-fixed --format json,html',
    expected: 'URLs gov.br devem ser acessíveis'
  },
  {
    name: 'wikipedia-test',
    description: 'Teste de substituição de parâmetros URL',
    command: 'node dist/main.js validate --input data/wikipedia-test.csv --config config/wikipedia-validation.yaml --output test-wikipedia-fixed --format json,html',
    expected: 'Parâmetros {titulo} devem ser substituídos corretamente'
  },
  {
    name: 'special-chars-test',
    description: 'Teste de navegação em sites externos',
    command: 'node dist/main.js validate --input data/special-chars-test.csv --config config/special-chars-test.yaml --output test-special-chars-fixed --format json,html',
    expected: 'Sites externos devem ser acessíveis sem timeout'
  },
  {
    name: 'llm-communication-test',
    description: 'Teste de comunicação com LLM Server',
    command: 'node dist/main.js validate --input data/sample.csv --config config/complete-validation.yaml --output test-llm-fixed --format json',
    expected: 'LLM Server deve responder corretamente via Node.js'
  }
];

// Cores para output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Função auxiliar para log
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Função para executar comando com timeout
function executeCommand(command, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timeout de ${timeout}ms excedido`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({ code, stdout, stderr });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

// Função para verificar se LLM Server está rodando
async function checkLLMServer() {
  try {
    const response = await fetch('http://localhost:8000/health');
    return response.ok;
  } catch {
    return false;
  }
}

// Função para analisar resultados
function analyzeResults(testName, stdout, stderr, exitCode) {
  const results = {
    success: false,
    issues: [],
    details: {}
  };

  // Análise específica por tipo de teste
  switch (testName) {
    case 'gov-br-test':
      if (stdout.includes('Navigation completed') && !stdout.includes('404')) {
        results.success = true;
      } else {
        results.issues.push('Falha ao acessar sites gov.br');
      }
      break;

    case 'wikipedia-test':
      const urlMatches = stdout.match(/https:\/\/pt\.wikipedia\.org\/wiki\/[^%]+/g);
      if (urlMatches && urlMatches.some(url => !url.includes('%7B'))) {
        results.success = true;
      } else {
        results.issues.push('Parâmetros URL não foram substituídos');
      }
      break;

    case 'special-chars-test':
      if (stdout.includes('Navigation completed') && !stdout.includes('Timeout')) {
        results.success = true;
      } else {
        results.issues.push('Timeout em sites externos');
      }
      break;

    case 'llm-communication-test':
      if (stdout.includes('LLM validation completed') || stdout.includes('confidence')) {
        results.success = true;
      } else {
        results.issues.push('Falha na comunicação com LLM Server');
      }
      break;
  }

  return results;
}

// Função principal de validação
async function validateFixes() {
  log('🧪 Iniciando validação das correções de bugs...', colors.blue);
  log('='.repeat(60), colors.blue);

  // Verificar se LLM Server está rodando
  log('Verificando LLM Server...', colors.yellow);
  const llmRunning = await checkLLMServer();
  if (!llmRunning) {
    log('⚠️  LLM Server não está rodando. Iniciando...', colors.yellow);
    const llmProcess = spawn('python3', ['llm-server.py'], {
      stdio: 'ignore',
      detached: true
    });
    llmProcess.unref();

    // Aguardar inicialização
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Verificar se build existe
  if (!fs.existsSync('dist/main.js')) {
    log('📦 Compilando TypeScript...', colors.yellow);
    await executeCommand('npm run build');
  }

  const results = [];

  for (const testCase of TEST_CASES) {
    log(`\n🧪 Executando: ${testCase.name}`, colors.blue);
    log(`Descrição: ${testCase.description}`, colors.blue);
    log(`Esperado: ${testCase.expected}`, colors.blue);

    try {
      const { code, stdout, stderr } = await executeCommand(testCase.command);
      const analysis = analyzeResults(testCase.name, stdout, stderr, code);

      results.push({
        name: testCase.name,
        success: analysis.success,
        issues: analysis.issues,
        exitCode: code
      });

      if (analysis.success) {
        log(`✅ ${testCase.name}: SUCESSO`, colors.green);
      } else {
        log(`❌ ${testCase.name}: FALHA`, colors.red);
        analysis.issues.forEach(issue => log(`   - ${issue}`, colors.red));
      }

      // Salvar logs detalhados
      const logDir = path.join('test-logs', testCase.name);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(logDir, 'stdout.log'),
        stdout
      );
      fs.writeFileSync(
        path.join(logDir, 'stderr.log'),
        stderr
      );

    } catch (error) {
      log(`❌ ${testCase.name}: ERRO - ${error.message}`, colors.red);
      results.push({
        name: testCase.name,
        success: false,
        issues: [error.message],
        exitCode: -1
      });
    }
  }

  // Resumo final
  log('\n' + '='.repeat(60), colors.blue);
  log('📊 RESUMO DA VALIDAÇÃO', colors.blue);
  log('='.repeat(60), colors.blue);

  const successful = results.filter(r => r.success).length;
  const total = results.length;

  log(`✅ Testes bem-sucedidos: ${successful}/${total}`, colors.green);
  log(`❌ Testes com falhas: ${total - successful}/${total}`, colors.red);

  if (successful === total) {
    log('\n🎉 TODOS OS BUGS FORAM CORRIGIDOS!', colors.green);
  } else {
    log('\n⚠️  ALGUNS BUGS PERSISTEM:', colors.yellow);
    results.filter(r => !r.success).forEach(r => {
      log(`   - ${r.name}: ${r.issues.join(', ')}`, colors.red);
    });
  }

  return successful === total;
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  validateFixes()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Erro crítico:', error);
      process.exit(1);
    });
}

export { validateFixes };
