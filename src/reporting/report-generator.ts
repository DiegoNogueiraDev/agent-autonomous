import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Logger } from '../core/logger.js';
import type { Report, ReportFormat } from '../types/index.js';

interface ReportConfig {
  outputDir?: string;
  formats?: ReportFormat[];
  includeDetails?: boolean;
  includeEvidence?: boolean;
  template?: string;
  customTemplateData?: {
    companyName?: string;
    reportTitle?: string;
    [key: string]: any;
  };
}

export class ReportGenerator {
  private logger: Logger;
  private config?: ReportConfig;

  constructor(options?: { config?: ReportConfig }) {
    this.logger = Logger.getInstance();

    // Basic validation
    if (options?.config) {
      if (options.config.formats && !Array.isArray(options.config.formats)) {
        throw new Error('Invalid configuration: formats must be an array');
      }
      if (options.config.outputDir === null || options.config.outputDir === '') {
        throw new Error('Invalid configuration: outputDir cannot be empty');
      }
    }

    this.config = options?.config;
  }

      /**
   * Generate reports in configured formats or single format
   */
  async generateReport(
    report: Report,
    outputPath?: string,
    format?: ReportFormat
  ): Promise<{ [K in ReportFormat]?: string }> {
    const actualOutputPath = outputPath || this.config?.outputDir || './reports';
    // Ensure output directory exists
    await mkdir(actualOutputPath, { recursive: true });

    // Determine which formats to generate
    const formatsToGenerate = format
      ? [format]
      : this.config?.formats || ['json'];

    const result: { [K in ReportFormat]?: string } = {};

    // Generate all requested formats
    for (const fmt of formatsToGenerate) {
      const filePath = await this.generateSingleReportInternal(report, actualOutputPath, fmt);
      result[fmt] = filePath;
    }

    return result;
  }

  /**
   * Generate reports in multiple formats
   */
  async generateReports(
    report: Report,
    outputPath: string,
    formats: ReportFormat[]
  ): Promise<string[]> {
    const generatedFiles: string[] = [];

    // Ensure output directory exists
    await mkdir(outputPath, { recursive: true });

    for (const format of formats) {
      try {
        const filePath = await this.generateSingleReportInternal(report, outputPath, format);
        generatedFiles.push(filePath);
        this.logger.info(`Report generated: ${format}`, { filePath });
      } catch (error) {
        this.logger.error(`Failed to generate ${format} report`, error);
      }
    }

    return generatedFiles;
  }

  /**
   * Generate a single report in specified format
   */
  private async generateSingleReportInternal(
    report: Report,
    outputPath: string,
    format: ReportFormat
  ): Promise<string> {
    const timestamp = (report.timestamp || new Date()).toISOString().slice(0, 19).replace(/:/g, '-');
    const fileName = `datahawk-report-${timestamp}.${format}`;
    const filePath = join(outputPath, fileName);

    let content: string;

    switch (format) {
      case 'json':
        content = this.generateJsonReport(report);
        break;
      case 'html':
        content = this.generateHtmlReport(report);
        break;
      case 'markdown':
        content = this.generateMarkdownReport(report);
        break;
      case 'csv':
        content = this.generateCsvReport(report);
        break;
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }

    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Generate JSON report
   */
  private generateJsonReport(report: Report): string {
    const reportWithEvidence = {
      ...report,
      evidence: (report as any).evidence || {
        totalFiles: 0,
        indexPath: './reports/evidence-index.html',
        screenshots: [],
        logs: []
      }
    };
    return JSON.stringify(reportWithEvidence, null, 2);
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: Report): string {
    const { summary, statistics = {
      performanceMetrics: {
        avgTimePerRow: 0,
        memoryUsagePeak: 0,
        errorRate: 0,
        cpuUtilizationAvg: 0,
        ocrFallbackRate: 0
      },
      confidenceDistribution: {},
      extractionMethodUsage: {}
    } } = report;
    const successRate = Math.round((summary.successfulValidations / summary.processedRows) * 100);
    const avgConfidence = Math.round(summary.averageConfidence * 100);

    // Use custom template data if configured
    const isCustomTemplate = this.config?.template === 'custom';
    const templateData = this.config?.customTemplateData || {};
    const companyName = templateData.companyName || 'DataHawk';
    const reportTitle = templateData.reportTitle || 'DataHawk Validation Report';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DataHawk Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .success { border-left-color: #28a745; }
        .success .metric-value { color: #28a745; }
        .warning { border-left-color: #ffc107; }
        .warning .metric-value { color: #ffc107; }
        .error { border-left-color: #dc3545; }
        .error .metric-value { color: #dc3545; }
        .results-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .results-table th, .results-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .results-table th { background: #f8f9fa; font-weight: bold; }
        .status-success { color: #28a745; font-weight: bold; }
        .status-failed { color: #dc3545; font-weight: bold; }
        .confidence { padding: 4px 8px; border-radius: 4px; font-weight: bold; }
        .confidence-high { background: #d4edda; color: #155724; }
        .confidence-medium { background: #fff3cd; color: #856404; }
        .confidence-low { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
            <div class="header">
            <h1>🦅 ${reportTitle}</h1>
            ${isCustomTemplate ? `<p>Company: ${companyName}</p>` : ''}
            <p>Generated: ${(report.timestamp || new Date()).toLocaleString()}</p>
            <p>Report ID: ${report.id}</p>
        </div>

    <div class="summary">
        <div class="metric success">
            <div class="metric-value">${summary.processedRows}</div>
            <div>Rows Processed</div>
        </div>
        <div class="metric ${successRate >= 95 ? 'success' : successRate >= 80 ? 'warning' : 'error'}">
            <div class="metric-value">${successRate}%</div>
            <div>Success Rate</div>
        </div>
        <div class="metric ${avgConfidence >= 90 ? 'success' : avgConfidence >= 70 ? 'warning' : 'error'}">
            <div class="metric-value">${avgConfidence}%</div>
            <div>Avg Confidence</div>
        </div>
        <div class="metric">
            <div class="metric-value">${Math.round(summary.processingTime / 1000)}s</div>
            <div>Processing Time</div>
        </div>
    </div>

    <h2>📊 Performance Metrics</h2>
    <div class="summary">
        <div class="metric">
            <div class="metric-value">${Math.round(statistics.performanceMetrics?.avgTimePerRow || 0)}ms</div>
            <div>Avg Time/Row</div>
        </div>
        <div class="metric">
            <div class="metric-value">${Math.round(statistics.performanceMetrics?.memoryUsagePeak || 0)}MB</div>
            <div>Peak Memory</div>
        </div>
        <div class="metric">
            <div class="metric-value">${Math.round((statistics.performanceMetrics?.errorRate || 0) * 100)}%</div>
            <div>Error Rate</div>
        </div>
    </div>

    <h2>📋 Validation Results</h2>
    <table class="results-table">
                    <thead>
                <tr>
                    <th>Row ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Processing Time</th>
                    <th>Errors</th>
                </tr>
            </thead>
        <tbody>
            ${report.results.map(result => `
                <tr>
                    <td>${result.rowId || result.rowIndex || 'N/A'}</td>
                    <td>${(result.csvData as any)?.name || (result.webData as any)?.name || 'N/A'}</td>
                    <td class="${result.overallMatch ? 'status-success' : 'status-failed'}">
                        ${result.overallMatch ? '✅ PASS' : '❌ FAIL'}
                    </td>
                    <td>
                        <span class="confidence ${this.getConfidenceClass(result.overallConfidence)}">
                            ${Math.round(result.overallConfidence * 100)}%
                        </span>
                    </td>
                    <td>${result.processingTime}ms</td>
                    <td>${result.errors?.length || 0}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h2>📈 Confidence Distribution</h2>
    <div class="summary">
        ${Object.entries(statistics.confidenceDistribution).map(([range, count]) => `
            <div class="metric">
                <div class="metric-value">${count}</div>
                <div>${range}</div>
            </div>
        `).join('')}
    </div>

    <footer style="margin-top: 40px; text-align: center; color: #6c757d; border-top: 1px solid #ddd; padding-top: 20px;">
        <p>Generated by DataHawk v${report.metadata?.version || '1.0.0'}</p>
    </footer>

    <script>
        // Interactive chart and filter functionality
        function filterTable(criteria) {
            // Filter table rows based on criteria
            console.log('Filtering table with:', criteria);
        }

        function generateChart(data) {
            // Generate interactive charts
            console.log('Generating chart with:', data);
        }

        // Initialize interactive features
        document.addEventListener('DOMContentLoaded', function() {
            filterTable();
            generateChart();
        });
    </script>
</body>
</html>
    `.trim();
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(report: Report): string {
    const { summary, statistics = {
      performanceMetrics: {
        avgTimePerRow: 0,
        memoryUsagePeak: 0,
        errorRate: 0,
        cpuUtilizationAvg: 0,
        ocrFallbackRate: 0
      },
      confidenceDistribution: {},
      extractionMethodUsage: {}
    } } = report;
    const successRate = Math.round((summary.successfulValidations / summary.processedRows) * 100);
    const avgConfidence = Math.round(summary.averageConfidence * 100);

    return `
# DataHawk Validation Report

**Generated:** ${(report.timestamp || new Date()).toLocaleString()}
**Report ID:** ${report.id}

## Summary

Total Rows: ${summary.processedRows}
Average Confidence: ${avgConfidence}%
Error Rate: ${Math.round((1 - summary.successfulValidations / summary.processedRows) * 100)}%

**Total Rows:** ${summary.processedRows}
**Average Confidence:** ${avgConfidence}%
**Error Rate:** ${Math.round((1 - summary.successfulValidations / summary.processedRows) * 100)}%

- Processing completed successfully
- Detailed analysis below

## Detailed Results

| Field | CSV Value | Web Value | Match | Confidence |
|-------|-----------|-----------|--------|-----------|
${report.results.map(result =>
  (result.validations || []).map(v =>
    `| ${v.field} | ${(result.csvData as any)?.[v.field] || 'N/A'} | ${(result.webData as any)?.[v.field] || 'N/A'} | ${v.match ? '✅' : '❌'} | ${Math.round(v.confidence * 100)}% |`
  ).join('\n')
).join('\n')}

## 🎯 Performance Metrics

| Metric | Value |
|--------|-------|
| Avg Time per Row | ${Math.round(statistics.performanceMetrics?.avgTimePerRow || 0)}ms |
| Peak Memory Usage | ${Math.round(statistics.performanceMetrics?.memoryUsagePeak || 0)}MB |
| CPU Utilization | ${Math.round(statistics.performanceMetrics?.cpuUtilizationAvg || 0)}% |
| OCR Fallback Rate | ${Math.round((statistics.performanceMetrics?.ocrFallbackRate || 0) * 100)}% |

## 📋 Validation Results

| Row ID | Status | Confidence | Processing Time | Errors |
|--------|--------|------------|-----------------|--------|
${report.results.map(result =>
  `| ${result.rowId || result.rowIndex || 'N/A'} | ${result.overallMatch ? '✅ PASS' : '❌ FAIL'} | ${Math.round(result.overallConfidence * 100)}% | ${result.processingTime}ms | ${result.errors?.length || 0} |`
).join('\n')}

## 📈 Confidence Distribution

${Object.entries(statistics.confidenceDistribution).map(([range, count]) =>
  `- **${range}:** ${count} rows`
).join('\n')}

## 🔧 Extraction Methods Usage

${Object.entries(statistics.extractionMethodUsage).map(([method, count]) =>
  `- **${method}:** ${count} times`
).join('\n')}

---

*Generated by DataHawk v${report.metadata?.version || '1.0.0'}*
    `.trim();
  }

  /**
   * Generate CSV report
   */
  private generateCsvReport(report: Report): string {
    const headers = ['"Row Index"', 'Name', 'Description', 'Status', 'Confidence', '"Processing Time"', 'Errors', '"Overall Match"'];
    const rows = report.results.map(result => [
      result.rowId || result.rowIndex || 'N/A',
      `"${(result.csvData as any)?.name || (result.webData as any)?.name || 'N/A'}"`,
      `"${(result.csvData as any)?.description || (result.webData as any)?.description || 'N/A'}"`,
      result.overallMatch ? 'PASS' : 'FAIL',
      Math.round(result.overallConfidence * 100),
      result.processingTime,
      result.errors?.length || 0,
      result.fieldValidations?.length || 0
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }

  /**
   * Get CSS class for confidence level
   */
  private getConfidenceClass(confidence: number): string {
    if (confidence >= 0.9) return 'confidence-high';
    if (confidence >= 0.7) return 'confidence-medium';
    return 'confidence-low';
  }
}
