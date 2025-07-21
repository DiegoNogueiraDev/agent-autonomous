import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Logger } from '../core/logger.js';
import type { Report, ReportFormat } from '../types/index.js';

export class ReportGenerator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
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
        const filePath = await this.generateReport(report, outputPath, format);
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
  private async generateReport(
    report: Report, 
    outputPath: string, 
    format: ReportFormat
  ): Promise<string> {
    const timestamp = report.timestamp.toISOString().slice(0, 19).replace(/:/g, '-');
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
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: Report): string {
    const { summary, statistics } = report;
    const successRate = Math.round((summary.successfulValidations / summary.processedRows) * 100);
    const avgConfidence = Math.round(summary.averageConfidence * 100);

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
        <h1>🦅 DataHawk Validation Report</h1>
        <p>Generated: ${report.timestamp.toLocaleString()}</p>
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
            <div class="metric-value">${Math.round(statistics.performanceMetrics.avgTimePerRow)}ms</div>
            <div>Avg Time/Row</div>
        </div>
        <div class="metric">
            <div class="metric-value">${Math.round(statistics.performanceMetrics.memoryUsagePeak)}MB</div>
            <div>Peak Memory</div>
        </div>
        <div class="metric">
            <div class="metric-value">${Math.round(statistics.performanceMetrics.errorRate * 100)}%</div>
            <div>Error Rate</div>
        </div>
    </div>

    <h2>📋 Validation Results</h2>
    <table class="results-table">
        <thead>
            <tr>
                <th>Row ID</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Processing Time</th>
                <th>Errors</th>
            </tr>
        </thead>
        <tbody>
            ${report.results.map(result => `
                <tr>
                    <td>${result.rowId}</td>
                    <td class="${result.overallMatch ? 'status-success' : 'status-failed'}">
                        ${result.overallMatch ? '✅ PASS' : '❌ FAIL'}
                    </td>
                    <td>
                        <span class="confidence ${this.getConfidenceClass(result.overallConfidence)}">
                            ${Math.round(result.overallConfidence * 100)}%
                        </span>
                    </td>
                    <td>${result.processingTime}ms</td>
                    <td>${result.errors.length}</td>
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
        <p>Generated by DataHawk v${report.metadata.version}</p>
    </footer>
</body>
</html>
    `.trim();
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(report: Report): string {
    const { summary, statistics } = report;
    const successRate = Math.round((summary.successfulValidations / summary.processedRows) * 100);
    const avgConfidence = Math.round(summary.averageConfidence * 100);

    return `
# 🦅 DataHawk Validation Report

**Generated:** ${report.timestamp.toLocaleString()}  
**Report ID:** ${report.id}

## 📊 Summary

| Metric | Value |
|--------|-------|
| Rows Processed | ${summary.processedRows}/${summary.totalRows} |
| Success Rate | ${successRate}% |
| Average Confidence | ${avgConfidence}% |
| Processing Time | ${Math.round(summary.processingTime / 1000)}s |
| Error Rate | ${Math.round(summary.errorRate * 100)}% |

## 🎯 Performance Metrics

| Metric | Value |
|--------|-------|
| Avg Time per Row | ${Math.round(statistics.performanceMetrics.avgTimePerRow)}ms |
| Peak Memory Usage | ${Math.round(statistics.performanceMetrics.memoryUsagePeak)}MB |
| CPU Utilization | ${Math.round(statistics.performanceMetrics.cpuUtilizationAvg)}% |
| OCR Fallback Rate | ${Math.round(statistics.performanceMetrics.ocrFallbackRate * 100)}% |

## 📋 Validation Results

| Row ID | Status | Confidence | Processing Time | Errors |
|--------|--------|------------|-----------------|--------|
${report.results.map(result => 
  `| ${result.rowId} | ${result.overallMatch ? '✅ PASS' : '❌ FAIL'} | ${Math.round(result.overallConfidence * 100)}% | ${result.processingTime}ms | ${result.errors.length} |`
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

*Generated by DataHawk v${report.metadata.version}*
    `.trim();
  }

  /**
   * Generate CSV report
   */
  private generateCsvReport(report: Report): string {
    const headers = ['Row ID', 'Status', 'Confidence', 'Processing Time (ms)', 'Errors', 'Fields Validated'];
    const rows = report.results.map(result => [
      result.rowId,
      result.overallMatch ? 'PASS' : 'FAIL',
      Math.round(result.overallConfidence * 100),
      result.processingTime,
      result.errors.length,
      result.fieldValidations.length
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