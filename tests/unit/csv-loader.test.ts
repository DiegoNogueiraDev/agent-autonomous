import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { CSVLoader } from '../../src/core/csv-loader';
import type { CSVData } from '../../src/types/index';

describe('CSVLoader', () => {
  let csvLoader: CSVLoader;
  let testDataDir: string;

  beforeEach(async () => {
    csvLoader = new CSVLoader();
    testDataDir = join(process.cwd(), 'tests', 'fixtures');
    await mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await unlink(join(testDataDir, 'test-comma.csv'));
      await unlink(join(testDataDir, 'test-pipe.csv'));
      await unlink(join(testDataDir, 'test-semicolon.csv'));
      await unlink(join(testDataDir, 'test-invalid.csv'));
      await unlink(join(testDataDir, 'test-large.csv'));
    } catch {
      // Files may not exist
    }
  });

  describe('detectDelimiter', () => {
    test('should detect comma delimiter', () => {
      const sample = 'name,email,age\nJohn,john@test.com,30\nJane,jane@test.com,25';
      const delimiter = csvLoader.detectDelimiter(sample);
      expect(delimiter).toBe(',');
    });

    test('should detect pipe delimiter', () => {
      const sample = 'name|email|age\nJohn|john@test.com|30\nJane|jane@test.com|25';
      const delimiter = csvLoader.detectDelimiter(sample);
      expect(delimiter).toBe('|');
    });

    test('should detect semicolon delimiter', () => {
      const sample = 'name;email;age\nJohn;john@test.com;30\nJane;jane@test.com;25';
      const delimiter = csvLoader.detectDelimiter(sample);
      expect(delimiter).toBe(';');
    });

    test('should default to comma when unclear', () => {
      const sample = 'name email age\nJohn john@test.com 30';
      const delimiter = csvLoader.detectDelimiter(sample);
      expect(delimiter).toBe(',');
    });
  });

  describe('load', () => {
    test('should load valid CSV with comma delimiter', async () => {
      const csvContent = 'id,name,email,age\n1,John Doe,john@example.com,30\n2,Jane Smith,jane@example.com,25';
      const filePath = join(testDataDir, 'test-comma.csv');
      await writeFile(filePath, csvContent);

      const result: CSVData = await csvLoader.load(filePath);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        age: '30'
      });
      expect(result.metadata.delimiter).toBe(',');
      expect(result.metadata.headers).toEqual(['id', 'name', 'email', 'age']);
      expect(result.metadata.totalRows).toBe(2);
    });

    test('should load CSV with pipe delimiter', async () => {
      const csvContent = 'id|name|email|age\n1|John Doe|john@example.com|30\n2|Jane Smith|jane@example.com|25';
      const filePath = join(testDataDir, 'test-pipe.csv');
      await writeFile(filePath, csvContent);

      const result: CSVData = await csvLoader.load(filePath);

      expect(result.rows).toHaveLength(2);
      expect(result.metadata.delimiter).toBe('|');
      expect(result.rows[0]?.name).toBe('John Doe');
    });

    test('should handle empty lines and whitespace', async () => {
      const csvContent = 'id,name,email\n\n1,John Doe,john@example.com\n\n2,Jane Smith,jane@example.com\n';
      const filePath = join(testDataDir, 'test-comma.csv');
      await writeFile(filePath, csvContent);

      const result: CSVData = await csvLoader.load(filePath);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.name).toBe('John Doe');
    });

    test('should normalize headers to lowercase', async () => {
      const csvContent = 'ID,Name,Email,AGE\n1,John Doe,john@example.com,30';
      const filePath = join(testDataDir, 'test-comma.csv');
      await writeFile(filePath, csvContent);

      const result: CSVData = await csvLoader.load(filePath);

      expect(result.metadata.headers).toEqual(['id', 'name', 'email', 'age']);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('name');
    });

    test('should handle large CSV files', async () => {
      const headers = 'id,name,email,status\n';
      const rows = Array.from({ length: 1000 }, (_, i) => 
        `${i + 1},User ${i + 1},user${i + 1}@example.com,active`
      ).join('\n');
      const csvContent = headers + rows;
      
      const filePath = join(testDataDir, 'test-large.csv');
      await writeFile(filePath, csvContent);

      const result: CSVData = await csvLoader.load(filePath);

      expect(result.rows).toHaveLength(1000);
      expect(result.metadata.totalRows).toBe(1000);
    });

    test('should throw error for non-existent file', async () => {
      const filePath = join(testDataDir, 'non-existent.csv');
      
      await expect(csvLoader.load(filePath)).rejects.toThrow();
    });

    test('should handle invalid CSV format gracefully', async () => {
      const csvContent = 'header1\nvalue1\nvalue2,extra_column';
      const filePath = join(testDataDir, 'test-invalid.csv');
      await writeFile(filePath, csvContent);

      // Should either throw an error or handle gracefully
      try {
        const result = await csvLoader.load(filePath);
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to load CSV file');
      }
    });
  });

  describe('validateRows', () => {
    test('should validate basic data types', async () => {
      const rows = [
        { id: '1', name: 'John', email: 'john@test.com', age: '30' },
        { id: '2', name: 'Jane', email: 'jane@test.com', age: '25' }
      ];

      const result = await csvLoader.validateRows(rows);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect missing required fields', async () => {
      const rows = [
        { name: 'John', age: '30' }, // missing required 'id' field
        { id: '', name: 'Jane', age: '25' } // empty required 'id' field
      ];

      const result = await csvLoader.validateRows(rows);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate email format', async () => {
      const rows = [
        { id: '1', name: 'John', email: 'invalid-email', age: '30' },
        { id: '2', name: 'Jane', email: 'jane@test.com', age: '25' }
      ];

      const result = await csvLoader.validateRows(rows);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('email'))).toBe(true);
    });
  });

  describe('performance', () => {
    test('should load 10k rows within reasonable time', async () => {
      const headers = 'id,name,email,status,created_at\n';
      const rows = Array.from({ length: 10000 }, (_, i) => 
        `${i + 1},User ${i + 1},user${i + 1}@example.com,active,2025-01-01`
      ).join('\n');
      const csvContent = headers + rows;
      
      const filePath = join(testDataDir, 'test-large.csv');
      await writeFile(filePath, csvContent);

      const startTime = Date.now();
      const result = await csvLoader.load(filePath);
      const endTime = Date.now();

      expect(result.rows).toHaveLength(10000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});