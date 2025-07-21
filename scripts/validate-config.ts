/**
 * Script para validar arquivos de configuração YAML
 *
 * Uso: npx tsx scripts/validate-config.ts config/arquivo.yaml
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { ConfigManager } from '../src/core/config-manager';

async function validateConfig(configPath: string): Promise<void> {
  console.log(chalk.blue(`🔍 Validando configuração: ${configPath}`));

  try {
    // Verificar se o arquivo existe
    await fs.access(configPath);

    // Ler o conteúdo do arquivo para análise
    const content = await fs.readFile(configPath, 'utf-8');

    // Verificar se é um arquivo de configuração de validação
    if (!isValidationConfig(content)) {
      console.log(chalk.yellow(`⏭️ Pulando ${configPath} (não é um arquivo de configuração de validação)`));
      return;
    }

    // Verificar formato snake_case vs camelCase
    const camelCaseKeys = [
      'targetUrl', 'fieldMappings', 'csvField', 'webSelector',
      'fieldType', 'validationStrategy', 'validationRules',
      'minimumOverall', 'minimumField', 'ocrThreshold',
      'fuzzyMatchThreshold', 'fuzzyMatching', 'stringSimilarityThreshold',
      'numberTolerance', 'caseInsensitive', 'ignoreWhitespace',
      'specialCharacters', 'removeAccents', 'normalizeQuotes',
      'normalizeDashes', 'decimalSeparator', 'thousandSeparator',
      'currencySymbolRemove', 'targetFormat', 'inputFormats',
      'maxRetryAttempts', 'retryDelayMs', 'exponentialBackoff',
      'criticalErrors', 'recoverableErrors', 'escalationThreshold',
      'batchProcessing', 'batchSize', 'parallelWorkers',
      'domSnapshots', 'ocrResults', 'validationDecisions',
      'retentionDays', 'screenshotEnabled', 'domSnapshotEnabled',
      'compressionEnabled', 'includeInReports'
    ];

    const foundCamelCaseKeys = camelCaseKeys.filter(key => content.includes(key));

    if (foundCamelCaseKeys.length > 0) {
      console.log(chalk.yellow('⚠️ Aviso: Detectadas chaves em formato camelCase:'));
      foundCamelCaseKeys.forEach(key => {
        const snakeCase = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        console.log(`  ${chalk.red(key)} → ${chalk.green(snakeCase)}`);
      });
      console.log(chalk.yellow('As chaves devem estar em formato snake_case para compatibilidade.'));
    }

    // Validar usando ConfigManager
    const configManager = new ConfigManager();
    await configManager.loadValidationConfig(configPath);

    console.log(chalk.green('✅ Configuração válida!'));
  } catch (error) {
    console.log(chalk.red('❌ Erro na validação da configuração:'));
    if (error instanceof Error) {
      console.log(chalk.red(`   ${error.message}`));
    } else {
      console.log(chalk.red(`   Erro desconhecido: ${String(error)}`));
    }
    throw error;
  }
}

function isValidationConfig(content: string): boolean {
  // Verificar se contém chaves específicas de configuração de validação
  const validationKeys = ['target_url', 'targetUrl', 'field_mappings', 'fieldMappings'];
  return validationKeys.some(key => content.includes(key));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.yellow('Uso: npx tsx scripts/validate-config.ts config/arquivo.yaml'));
    console.log(chalk.yellow('Validando arquivos de configuração de validação...'));

    try {
      const configFiles = await fs.readdir('config');
      const yamlFiles = configFiles.filter(file =>
        (file.endsWith('.yaml') || file.endsWith('.yml'))
      );

      if (yamlFiles.length === 0) {
        console.log(chalk.yellow('Nenhum arquivo de configuração encontrado.'));
        process.exit(0);
      }

      console.log(chalk.blue(`Encontrados ${yamlFiles.length} arquivos de configuração.`));

      let hasErrors = false;
      let validatedCount = 0;

      for (const file of yamlFiles) {
        const configPath = path.join('config', file);
        try {
          await validateConfig(configPath);
          validatedCount++;
        } catch (error) {
          hasErrors = true;
        }
        console.log(''); // Linha em branco para separar
      }

      console.log(chalk.blue(`📊 Resultado: ${validatedCount} arquivos validados com sucesso`));

      if (hasErrors) {
        process.exit(1);
      }
    } catch (error) {
      console.log(chalk.red('Erro ao listar arquivos de configuração:'));
      console.log(chalk.red(`   ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  } else {
    await validateConfig(args[0]);
  }
}

main().catch(error => {
  console.error('Erro não tratado:', error);
  process.exit(1);
});
