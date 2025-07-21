/**
 * Configuração global para testes Jest
 * Este arquivo é executado uma vez antes de todos os testes
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Criar diretório temporário para testes
export const setupGlobalTestDir = async (): Promise<string> => {
  const testTempDir = path.join(os.tmpdir(), 'datahawk-test-' + Date.now());
  await fs.mkdir(testTempDir, { recursive: true });
  return testTempDir;
};

// Verificar se os serviços necessários estão em execução
export const checkRequiredServices = async (): Promise<void> => {
  // Verificar servidor LLM
  try {
    const llmResponse = await fetch('http://localhost:8000/health');
    const llmStatus = await llmResponse.json();

    if (!llmStatus.status || llmStatus.status !== 'healthy') {
      console.warn('⚠️ Servidor LLM não está saudável. Alguns testes podem falhar.');
    }
  } catch (error) {
    console.warn('⚠️ Servidor LLM não está respondendo. Execute ./scripts/setup-test-env.sh antes dos testes.');
  }

  // Verificar servidor OCR
  try {
    const ocrResponse = await fetch('http://localhost:5000/health');
    const ocrStatus = await ocrResponse.json();

    if (!ocrStatus.status || ocrStatus.status !== 'healthy') {
      console.warn('⚠️ Servidor OCR não está saudável. Alguns testes podem falhar.');
    }
  } catch (error) {
    console.warn('⚠️ Servidor OCR não está respondendo. Testes que dependem de OCR podem falhar.');
  }
};

// Verificar arquivos de configuração
export const checkConfigFiles = async (): Promise<void> => {
  try {
    // Verificar se existe pelo menos um arquivo de configuração no formato snake_case
    const configFiles = await fs.readdir('config');
    const snakeConfigFiles = configFiles.filter(file =>
      (file.endsWith('.yaml') || file.endsWith('.yml')) &&
      file.includes('.snake.')
    );

    if (snakeConfigFiles.length === 0) {
      console.warn('⚠️ Nenhum arquivo de configuração em formato snake_case encontrado. Execute ./scripts/setup-test-env.sh');
    }
  } catch (error) {
    console.warn('⚠️ Erro ao verificar arquivos de configuração:', error);
  }
};

// Função principal de setup
export default async function(): Promise<void> {
  try {
    await checkRequiredServices();
    await checkConfigFiles();
    console.log('✅ Ambiente de teste verificado');
  } catch (error) {
    console.error('❌ Erro ao verificar ambiente de teste:', error);
  }
};
