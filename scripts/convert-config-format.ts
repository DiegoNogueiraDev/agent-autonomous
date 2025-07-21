/**
 * Script para converter arquivos de configuração de camelCase para snake_case
 *
 * Uso: npx tsx scripts/convert-config-format.ts config/arquivo.yaml
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Mapeamento de chaves camelCase para snake_case
const keyMapping: Record<string, string> = {
  // Nível raiz
  'targetUrl': 'target_url',
  'fieldMappings': 'field_mappings',
  'validationRules': 'validation_rules',

  // Field Mappings
  'csvField': 'csv_field',
  'webSelector': 'web_selector',
  'fieldType': 'field_type',
  'validationStrategy': 'validation_strategy',
  'customRules': 'custom_rules',

  // Validation Rules - Confidence
  'minimumOverall': 'minimum_overall',
  'minimumField': 'minimum_field',
  'ocrThreshold': 'ocr_threshold',
  'fuzzyMatchThreshold': 'fuzzy_match_threshold',

  // Fuzzy Matching
  'fuzzyMatching': 'fuzzy_matching',
  'stringSimilarityThreshold': 'string_similarity_threshold',
  'numberTolerance': 'number_tolerance',
  'caseInsensitive': 'case_insensitive',
  'ignoreWhitespace': 'ignore_whitespace',

  // Normalization
  'trimLeading': 'trim_leading',
  'trimTrailing': 'trim_trailing',
  'normalizeInternal': 'normalize_internal',
  'specialCharacters': 'special_characters',
  'removeAccents': 'remove_accents',
  'normalizeQuotes': 'normalize_quotes',
  'normalizeDashes': 'normalize_dashes',
  'decimalSeparator': 'decimal_separator',
  'thousandSeparator': 'thousand_separator',
  'currencySymbolRemove': 'currency_symbol_remove',
  'targetFormat': 'target_format',
  'inputFormats': 'input_formats',

  // Error Handling
  'errorHandling': 'error_handling',
  'maxRetryAttempts': 'max_retry_attempts',
  'retryDelayMs': 'retry_delay_ms',
  'exponentialBackoff': 'exponential_backoff',
  'criticalErrors': 'critical_errors',
  'recoverableErrors': 'recoverable_errors',
  'escalationThreshold': 'escalation_threshold',

  // Performance
  'batchProcessing': 'batch_processing',
  'batchSize': 'batch_size',
  'parallelWorkers': 'parallel_workers',
  'domSnapshots': 'dom_snapshots',
  'ocrResults': 'ocr_results',
  'validationDecisions': 'validation_decisions',
  'domExtraction': 'dom_extraction',
  'ocrProcessing': 'ocr_processing',
  'validationDecision': 'validation_decision',
  'evidenceCollection': 'evidence_collection',

  // Evidence
  'retentionDays': 'retention_days',
  'screenshotEnabled': 'screenshot_enabled',
  'domSnapshotEnabled': 'dom_snapshot_enabled',
  'compressionEnabled': 'compression_enabled',
  'includeInReports': 'include_in_reports',
};

/**
 * Converte recursivamente todas as chaves de camelCase para snake_case
 */
function convertKeysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToSnakeCase(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = keyMapping[key] || key;
      result[newKey] = convertKeysToSnakeCase(value);
    }

    return result;
  }

  return obj;
}

async function convertConfigFile(filePath: string, outputPath?: string): Promise<void> {
  console.log(chalk.blue(`🔄 Convertendo arquivo: ${filePath}`));

  try {
    // Ler o arquivo
    const content = await fs.readFile(filePath, 'utf-8');

    // Parsear o YAML
    const config = parseYaml(content);

    // Converter as chaves
    const convertedConfig = convertKeysToSnakeCase(config);

    // Gerar o novo YAML
    const newContent = stringifyYaml(convertedConfig);

    // Determinar o caminho de saída
    const finalOutputPath = outputPath || filePath.replace('.yaml', '.snake.yaml');

    // Salvar o arquivo convertido
    await fs.writeFile(finalOutputPath, newContent, 'utf-8');

    console.log(chalk.green(`✅ Arquivo convertido com sucesso: ${finalOutputPath}`));
  } catch (error) {
    console.log(chalk.red('❌ Erro ao converter arquivo:'));
    if (error instanceof Error) {
      console.log(chalk.red(`   ${error.message}`));
    } else {
      console.log(chalk.red(`   Erro desconhecido: ${String(error)}`));
    }
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.yellow('Uso: npx tsx scripts/convert-config-format.ts config/arquivo.yaml [output.yaml]'));
    console.log(chalk.yellow('Convertendo todos os arquivos de configuração...'));

    try {
      const configFiles = await fs.readdir('config');
      const yamlFiles = configFiles.filter(file =>
        (file.endsWith('.yaml') || file.endsWith('.yml')) &&
        !file.includes('.snake.')
      );

      if (yamlFiles.length === 0) {
        console.log(chalk.yellow('Nenhum arquivo de configuração encontrado.'));
        process.exit(0);
      }

      console.log(chalk.blue(`Encontrados ${yamlFiles.length} arquivos de configuração.`));

      for (const file of yamlFiles) {
        const configPath = path.join('config', file);
        const outputPath = path.join('config', file.replace('.yaml', '.snake.yaml').replace('.yml', '.snake.yml'));
        await convertConfigFile(configPath, outputPath);
        console.log(''); // Linha em branco para separar
      }
    } catch (error) {
      console.log(chalk.red('Erro ao listar arquivos de configuração:'));
      console.log(chalk.red(`   ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  } else {
    const inputPath = args[0];
    const outputPath = args[1];
    await convertConfigFile(inputPath, outputPath);
  }
}

main().catch(error => {
  console.error('Erro não tratado:', error);
  process.exit(1);
});
