#!/usr/bin/env node

/**
 * DataHawk - Autonomous QA Browser Agent
 * Main entry point for the application
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { config } from 'dotenv';
import chalk from 'chalk';

// Load environment variables
config();

import { TaskmasterController } from './core/taskmaster.js';
import { ConfigManager } from './core/config-manager.js';
import { Logger } from './core/logger.js';
import type { ValidationConfig } from './types/index.js';

const logger = Logger.getInstance();

async function getVersion(): Promise<string> {
  try {
    const packageJson = await readFile(join(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(packageJson);
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function main() {
  const program = new Command();
  const version = await getVersion();

  program
    .name('datahawk')
    .description('Autonomous QA Browser Agent for CSV validation with web interfaces')
    .version(version);

  // Validate command
  program
    .command('validate')
    .description('Validate CSV data against web interface')
    .requiredOption('-i, --input <path>', 'Path to CSV input file')
    .requiredOption('-c, --config <path>', 'Path to validation configuration file')
    .option('-o, --output <path>', 'Output directory for reports (default: ./data/output)')
    .option('-f, --format <formats>', 'Report formats (json,html,markdown)', 'json,html')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--dry-run', 'Validate configuration without processing')
    .option('--max-rows <number>', 'Maximum number of rows to process')
    .option('--parallel <number>', 'Number of parallel workers (default: 3)', '3')
    .action(async (options) => {
      try {
        await handleValidateCommand(options);
      } catch (error) {
        logger.error('Validation failed:', error);
        process.exit(1);
      }
    });

  // Config command
  program
    .command('config')
    .description('Manage configuration')
    .option('--validate', 'Validate configuration files')
    .option('--generate', 'Generate sample configuration')
    .option('--path <path>', 'Configuration file path')
    .action(async (options) => {
      try {
        await handleConfigCommand(options);
      } catch (error) {
        logger.error('Configuration operation failed:', error);
        process.exit(1);
      }
    });

  // Status command
  program
    .command('status')
    .description('Check system status and requirements')
    .option('--models', 'Check LLM models availability')
    .option('--deps', 'Check dependencies')
    .action(async (options) => {
      try {
        await handleStatusCommand(options);
      } catch (error) {
        logger.error('Status check failed:', error);
        process.exit(1);
      }
    });

  // Model management commands
  program
    .command('models')
    .description('Manage LLM models')
    .option('--download', 'Download required models')
    .option('--list', 'List available models')
    .option('--verify', 'Verify model integrity')
    .action(async (options) => {
      try {
        await handleModelsCommand(options);
      } catch (error) {
        logger.error('Model operation failed:', error);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

async function handleValidateCommand(options: any) {
  console.log(chalk.blue.bold('🦅 DataHawk - Autonomous QA Browser Agent'));
  console.log(chalk.gray('Starting validation process...\n'));

  // Setup logging
  if (options.verbose) {
    process.env.LOG_LEVEL = 'debug';
  }

  // Load and validate configuration
  const configManager = new ConfigManager();
  const config = await configManager.loadValidationConfig(options.config);

  // Override config with CLI options
  if (options.maxRows) {
    config.performance = config.performance || {};
    config.performance.batchSize = Math.min(parseInt(options.maxRows), config.performance.batchSize || 100);
  }

  if (options.parallel) {
    config.performance = config.performance || {};
    config.performance.parallelWorkers = parseInt(options.parallel);
  }

  const outputPath = options.output || './data/output';
  const reportFormats = options.format.split(',');
  
  // Validate report formats
  const validFormats = ['json', 'html', 'markdown', 'csv'];
  const invalidFormats = reportFormats.filter((format: string) => !validFormats.includes(format.trim()));
  
  if (invalidFormats.length > 0) {
    console.error(chalk.red(`❌ Error: Invalid output format(s): ${invalidFormats.join(', ')}`));
    console.error(chalk.gray(`   Supported formats: ${validFormats.join(', ')}`));
    process.exit(1);
  }

  logger.info('Configuration loaded successfully', {
    input: options.input,
    config: options.config,
    output: outputPath,
    formats: reportFormats
  });

  if (options.dryRun) {
    console.log(chalk.green('✅ Dry run completed - configuration is valid'));
    return;
  }

  // Initialize and run Taskmaster
  const taskmaster = new TaskmasterController(config);
  
  console.log(chalk.yellow('🚀 Starting validation process...'));
  
  const startTime = Date.now();
  const result = await taskmaster.execute(options.input, {
    outputPath,
    reportFormats,
    progressCallback: (processed: number, total: number) => {
      const percentage = Math.round((processed / total) * 100);
      console.log(chalk.blue(`📊 Progress: ${processed}/${total} (${percentage}%)`));
    }
  });

  const duration = Date.now() - startTime;
  
  // Display results
  console.log('\n' + chalk.green.bold('✅ Validation completed!'));
  console.log(chalk.white(`📈 Summary:`));
  console.log(`   Processed: ${result.summary.processedRows}/${result.summary.totalRows} rows`);
  console.log(`   Success Rate: ${Math.round(result.summary.successfulValidations / result.summary.processedRows * 100)}%`);
  console.log(`   Average Confidence: ${Math.round(result.summary.averageConfidence * 100)}%`);
  console.log(`   Processing Time: ${Math.round(duration / 1000)}s`);
  console.log(`   Reports Generated: ${reportFormats.join(', ')}`);
  
  if (result.summary.errorRate > 0) {
    console.log(chalk.yellow(`⚠️  Error Rate: ${Math.round(result.summary.errorRate * 100)}%`));
  }
}

async function handleConfigCommand(options: any) {
  const configManager = new ConfigManager();

  if (options.validate) {
    const configPath = options.path || './config/validation.yaml';
    console.log(chalk.blue(`🔍 Validating configuration: ${configPath}`));
    
    try {
      await configManager.validateConfiguration(configPath);
      console.log(chalk.green('✅ Configuration is valid'));
    } catch (error) {
      console.log(chalk.red('❌ Configuration validation failed:'));
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.red(message));
      process.exit(1);
    }
  }

  if (options.generate) {
    console.log(chalk.blue('📝 Generating sample configuration...'));
    await configManager.generateSampleConfig('./config/sample-validation.yaml');
    console.log(chalk.green('✅ Sample configuration generated'));
  }
}

async function handleStatusCommand(options: any) {
  console.log(chalk.blue.bold('🔍 DataHawk System Status\n'));

  // Check Node.js version
  const nodeVersion = process.version;
  const requiredNode = '18.0.0';
  console.log(`Node.js: ${nodeVersion} ${nodeVersion >= 'v18.0.0' ? '✅' : '❌'}`);

  // Check Python
  try {
    const { execSync } = await import('child_process');
    let pythonVersion: string;
    
    try {
      pythonVersion = execSync('python --version', { encoding: 'utf-8' }).trim();
    } catch {
      // Try python3 if python is not found
      pythonVersion = execSync('python3 --version', { encoding: 'utf-8' }).trim();
    }
    
    console.log(`Python: ${pythonVersion} ✅`);
  } catch {
    console.log(`Python: Not found ❌`);
  }

  // Check models if requested
  if (options.models) {
    console.log('\n📦 LLM Models:');
    // TODO: Implement model checking
    console.log('  Mistral-7B-Instruct: Checking...');
    console.log('  Tiny-Dolphin-2.8B: Checking...');
  }

  // Check dependencies if requested
  if (options.deps) {
    console.log('\n📚 Dependencies:');
    console.log('  CrewAI: Checking...');
    console.log('  Playwright: Checking...');
    console.log('  Tesseract.js: Checking...');
  }
}

async function handleModelsCommand(options: any) {
  console.log(chalk.blue.bold('🤖 LLM Model Management\n'));

  if (options.list) {
    console.log('📋 Available Models:');
    console.log('  • Mistral-7B-Instruct-v0.3 (Q4_K_M) - Primary model');
    console.log('  • Tiny-Dolphin-2.8B (Q4_K_M) - Fallback model');
  }

  if (options.download) {
    console.log('📥 Model download functionality will be implemented...');
    // TODO: Implement model download
  }

  if (options.verify) {
    console.log('🔍 Model verification functionality will be implemented...');
    // TODO: Implement model verification
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Application failed to start:', error);
    process.exit(1);
  });
}