"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const csv_loader_1 = require("../../src/core/csv-loader");
(0, globals_1.describe)('CSVLoader', () => {
    let csvLoader;
    let testDataDir;
    (0, globals_1.beforeEach)(async () => {
        csvLoader = new csv_loader_1.CSVLoader();
        testDataDir = (0, path_1.join)(process.cwd(), 'tests', 'fixtures');
        await (0, promises_1.mkdir)(testDataDir, { recursive: true });
    });
    (0, globals_1.afterEach)(async () => {
        // Cleanup test files
        try {
            await (0, promises_1.unlink)((0, path_1.join)(testDataDir, 'test-comma.csv'));
            await (0, promises_1.unlink)((0, path_1.join)(testDataDir, 'test-pipe.csv'));
            await (0, promises_1.unlink)((0, path_1.join)(testDataDir, 'test-semicolon.csv'));
            await (0, promises_1.unlink)((0, path_1.join)(testDataDir, 'test-invalid.csv'));
            await (0, promises_1.unlink)((0, path_1.join)(testDataDir, 'test-large.csv'));
        }
        catch {
            // Files may not exist
        }
    });
    (0, globals_1.describe)('detectDelimiter', () => {
        (0, globals_1.test)('should detect comma delimiter', () => {
            const sample = 'name,email,age\nJohn,john@test.com,30\nJane,jane@test.com,25';
            const delimiter = csvLoader.detectDelimiter(sample);
            (0, globals_1.expect)(delimiter).toBe(',');
        });
        (0, globals_1.test)('should detect pipe delimiter', () => {
            const sample = 'name|email|age\nJohn|john@test.com|30\nJane|jane@test.com|25';
            const delimiter = csvLoader.detectDelimiter(sample);
            (0, globals_1.expect)(delimiter).toBe('|');
        });
        (0, globals_1.test)('should detect semicolon delimiter', () => {
            const sample = 'name;email;age\nJohn;john@test.com;30\nJane;jane@test.com;25';
            const delimiter = csvLoader.detectDelimiter(sample);
            (0, globals_1.expect)(delimiter).toBe(';');
        });
        (0, globals_1.test)('should default to comma when unclear', () => {
            const sample = 'name email age\nJohn john@test.com 30';
            const delimiter = csvLoader.detectDelimiter(sample);
            (0, globals_1.expect)(delimiter).toBe(',');
        });
    });
    (0, globals_1.describe)('load', () => {
        (0, globals_1.test)('should load valid CSV with comma delimiter', async () => {
            const csvContent = 'id,name,email,age\n1,John Doe,john@example.com,30\n2,Jane Smith,jane@example.com,25';
            const filePath = (0, path_1.join)(testDataDir, 'test-comma.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            const result = await csvLoader.load(filePath);
            (0, globals_1.expect)(result.rows).toHaveLength(2);
            (0, globals_1.expect)(result.rows[0]).toEqual({
                id: '1',
                name: 'John Doe',
                email: 'john@example.com',
                age: '30'
            });
            (0, globals_1.expect)(result.metadata.delimiter).toBe(',');
            (0, globals_1.expect)(result.metadata.headers).toEqual(['id', 'name', 'email', 'age']);
            (0, globals_1.expect)(result.metadata.totalRows).toBe(2);
        });
        (0, globals_1.test)('should load CSV with pipe delimiter', async () => {
            const csvContent = 'id|name|email|age\n1|John Doe|john@example.com|30\n2|Jane Smith|jane@example.com|25';
            const filePath = (0, path_1.join)(testDataDir, 'test-pipe.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            const result = await csvLoader.load(filePath);
            (0, globals_1.expect)(result.rows).toHaveLength(2);
            (0, globals_1.expect)(result.metadata.delimiter).toBe('|');
            (0, globals_1.expect)(result.rows[0]?.name).toBe('John Doe');
        });
        (0, globals_1.test)('should handle empty lines and whitespace', async () => {
            const csvContent = 'id,name,email\n\n1,John Doe,john@example.com\n\n2,Jane Smith,jane@example.com\n';
            const filePath = (0, path_1.join)(testDataDir, 'test-comma.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            const result = await csvLoader.load(filePath);
            (0, globals_1.expect)(result.rows).toHaveLength(2);
            (0, globals_1.expect)(result.rows[0]?.name).toBe('John Doe');
        });
        (0, globals_1.test)('should normalize headers to lowercase', async () => {
            const csvContent = 'ID,Name,Email,AGE\n1,John Doe,john@example.com,30';
            const filePath = (0, path_1.join)(testDataDir, 'test-comma.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            const result = await csvLoader.load(filePath);
            (0, globals_1.expect)(result.metadata.headers).toEqual(['id', 'name', 'email', 'age']);
            (0, globals_1.expect)(result.rows[0]).toHaveProperty('id');
            (0, globals_1.expect)(result.rows[0]).toHaveProperty('name');
        });
        (0, globals_1.test)('should handle large CSV files', async () => {
            const headers = 'id,name,email,status\n';
            const rows = Array.from({ length: 1000 }, (_, i) => `${i + 1},User ${i + 1},user${i + 1}@example.com,active`).join('\n');
            const csvContent = headers + rows;
            const filePath = (0, path_1.join)(testDataDir, 'test-large.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            const result = await csvLoader.load(filePath);
            (0, globals_1.expect)(result.rows).toHaveLength(1000);
            (0, globals_1.expect)(result.metadata.totalRows).toBe(1000);
        });
        (0, globals_1.test)('should throw error for non-existent file', async () => {
            const filePath = (0, path_1.join)(testDataDir, 'non-existent.csv');
            await (0, globals_1.expect)(csvLoader.load(filePath)).rejects.toThrow();
        });
        (0, globals_1.test)('should handle invalid CSV format gracefully', async () => {
            const csvContent = 'header1\nvalue1\nvalue2,extra_column';
            const filePath = (0, path_1.join)(testDataDir, 'test-invalid.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            // Should either throw an error or handle gracefully
            try {
                const result = await csvLoader.load(filePath);
                (0, globals_1.expect)(result.rows.length).toBeGreaterThanOrEqual(0);
            }
            catch (error) {
                (0, globals_1.expect)(error).toBeInstanceOf(Error);
                (0, globals_1.expect)(error.message).toContain('Failed to load CSV file');
            }
        });
    });
    (0, globals_1.describe)('validateRows', () => {
        (0, globals_1.test)('should validate basic data types', async () => {
            const rows = [
                { id: '1', name: 'John', email: 'john@test.com', age: '30' },
                { id: '2', name: 'Jane', email: 'jane@test.com', age: '25' }
            ];
            const result = await csvLoader.validateRows(rows);
            (0, globals_1.expect)(result.valid).toBe(true);
            (0, globals_1.expect)(result.errors).toHaveLength(0);
        });
        (0, globals_1.test)('should detect missing required fields', async () => {
            const rows = [
                { name: 'John', age: '30' }, // missing required 'id' field
                { id: '', name: 'Jane', age: '25' } // empty required 'id' field
            ];
            const result = await csvLoader.validateRows(rows);
            (0, globals_1.expect)(result.valid).toBe(false);
            (0, globals_1.expect)(result.errors.length).toBeGreaterThan(0);
        });
        (0, globals_1.test)('should validate email format', async () => {
            const rows = [
                { id: '1', name: 'John', email: 'invalid-email', age: '30' },
                { id: '2', name: 'Jane', email: 'jane@test.com', age: '25' }
            ];
            const result = await csvLoader.validateRows(rows);
            (0, globals_1.expect)(result.valid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.message.includes('email'))).toBe(true);
        });
    });
    (0, globals_1.describe)('performance', () => {
        (0, globals_1.test)('should load 10k rows within reasonable time', async () => {
            const headers = 'id,name,email,status,created_at\n';
            const rows = Array.from({ length: 10000 }, (_, i) => `${i + 1},User ${i + 1},user${i + 1}@example.com,active,2025-01-01`).join('\n');
            const csvContent = headers + rows;
            const filePath = (0, path_1.join)(testDataDir, 'test-large.csv');
            await (0, promises_1.writeFile)(filePath, csvContent);
            const startTime = Date.now();
            const result = await csvLoader.load(filePath);
            const endTime = Date.now();
            (0, globals_1.expect)(result.rows).toHaveLength(10000);
            (0, globals_1.expect)(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
        });
    });
});
//# sourceMappingURL=csv-loader.test.js.map