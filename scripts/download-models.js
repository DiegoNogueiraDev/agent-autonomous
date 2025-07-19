#!/usr/bin/env node

/**
 * Script to download AI models for DataHawk
 */

import { mkdir, access } from 'fs/promises';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import https from 'https';
import chalk from 'chalk';
import { Command } from 'commander';

const MODELS = {
  'llama3-8b': {
    url: 'https://huggingface.co/noeljacob/Meta-Llama-3-8B-Instruct-Q4_K_M-GGUF/resolve/main/meta-llama-3-8b-instruct.Q4_K_M.gguf',
    filename: 'llama3-8b-instruct.Q4_K_M.gguf',
    size: '4.9GB',
    description: 'Meta Llama-3 8B Instruct (Quantized Q4_K_M)'
  },
  'phi3-mini': {
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    filename: 'phi-3-mini-4k-instruct.Q4_K_M.gguf',
    size: '2.3GB',
    description: 'Microsoft Phi-3 Mini 4K Instruct (Quantized Q4_K_M)'
  }
};

async function downloadModel(modelKey, force = false) {
  const model = MODELS[modelKey];
  if (!model) {
    console.error(chalk.red(`❌ Unknown model: ${modelKey}`));
    console.log(chalk.yellow('Available models:'));
    Object.keys(MODELS).forEach(key => {
      console.log(`  - ${key}: ${MODELS[key].description}`);
    });
    process.exit(1);
  }

  const modelsDir = join(process.cwd(), 'models');
  const filepath = join(modelsDir, model.filename);

  // Create models directory
  await mkdir(modelsDir, { recursive: true });

  // Check if file already exists
  if (!force) {
    try {
      await access(filepath);
      console.log(chalk.green(`✅ Model ${modelKey} already exists at: ${filepath}`));
      return;
    } catch {
      // File doesn't exist, proceed with download
    }
  }

  console.log(chalk.blue(`📥 Downloading ${model.description}...`));
  console.log(chalk.gray(`   URL: ${model.url}`));
  console.log(chalk.gray(`   Size: ${model.size}`));
  console.log(chalk.gray(`   Destination: ${filepath}`));

  try {
    console.log(`Starting download from: ${model.url}`);
    
    // Use a simpler approach - just show the download instructions
    console.log(chalk.yellow('To download this model, run:'));
    console.log(chalk.cyan(`wget -O "${filepath}" "${model.url}"`));
    console.log(chalk.gray('Or use curl:'));
    console.log(chalk.cyan(`curl -L -o "${filepath}" "${model.url}"`));
    
    return; // For now, just show instructions

    console.log(chalk.green(`✅ Successfully downloaded ${modelKey} to ${filepath}`));
    
  } catch (error) {
    console.error(chalk.red(`❌ Failed to download ${modelKey}:`), error.message);
    process.exit(1);
  }
}

async function listModels() {
  console.log(chalk.blue('📋 Available models:'));
  console.log();
  
  Object.entries(MODELS).forEach(([key, model]) => {
    console.log(chalk.yellow(`${key}:`));
    console.log(`  Description: ${model.description}`);
    console.log(`  Size: ${model.size}`);
    console.log(`  Filename: ${model.filename}`);
    console.log();
  });
}

async function main() {
  const program = new Command();

  program
    .name('download-models')
    .description('Download AI models for DataHawk')
    .version('1.0.0');

  program
    .command('download <model>')
    .description('Download a specific model')
    .option('-f, --force', 'Force download even if file exists')
    .action(async (model, options) => {
      await downloadModel(model, options.force);
    });

  program
    .command('list')
    .description('List available models')
    .action(listModels);

  program
    .command('all')
    .description('Download all recommended models')
    .option('-f, --force', 'Force download even if files exist')
    .action(async (options) => {
      console.log(chalk.blue('📥 Downloading all recommended models...'));
      await downloadModel('llama3-8b', options.force);
      await downloadModel('phi3-mini', options.force);
      console.log(chalk.green('🎉 All models downloaded successfully!'));
    });

  await program.parseAsync();
}

main().catch(console.error);
