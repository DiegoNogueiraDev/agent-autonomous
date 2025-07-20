#!/usr/bin/env node

/**
 * Teste final para validar todas as correções de bugs
 */

import { TaskmasterController } from './dist/core/taskmaster.js';

async function testFinalValidation() {
  console.log('🧪 Teste final de validação completa...');

  try {
    // Teste com configuração corrigida
    const taskmaster = new TaskmasterController();

    const result = await taskmaster.validateData({
      inputPath: 'data/gov-br-test.csv',
      configPath: 'config/gov-br-test-fixed.yaml',
      outputPath: 'test-final-validation',
      formats: ['json'],
      maxRows: 2
    });

    console.log('\n📊 Resultados do teste final:');
    console.log(`Total de linhas: ${result.summary.totalRows}`);
    console.log(`Validações bem-sucedidas: ${result.summary.successfulValidations}`);
    console.log(`Validações falhadas: ${result.summary.failedValidations}`);
    console.log(`Taxa de sucesso: ${(result.summary.successfulValidations / result.summary.processedRows * 100).toFixed(1)}%`);
    console.log(`Confiança média: ${result.summary.averageConfidence.toFixed(2)}`);

    // Verificar falsos positivos
    const falsePositives = result.results.filter(r =>
      r.overallMatch === true &&
      (!r.fieldValidations || r.fieldValidations.length === 0 ||
        r.fieldValidations.every(v => !v.match))
    );

    console.log(`\n❌ Falsos positivos: ${falsePositives.length}`);

    if (falsePositives.length > 0) {
      console.log('Corrigindo lógica de validação...');
    } else {
      console.log('✅ Sem falsos positivos detectados');
    }

    console.log('\n✅ Teste final concluído');

  } catch (error) {
    console.error('❌ Erro no teste final:', error.message);
  }
}

testFinalValidation().catch(console.error);
