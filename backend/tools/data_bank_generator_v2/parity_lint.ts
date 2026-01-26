/**
 * Parity Linter v2
 *
 * Ensures EN/PT coverage parity across all data banks.
 * Fails if PT counts are less than EN counts.
 *
 * Usage:
 *   npx ts-node parity_lint.ts
 *   npx ts-node parity_lint.ts --fix (attempt auto-fixes)
 *   npx ts-node parity_lint.ts --report (output markdown report)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  dataDir: path.join(__dirname, '../../src/data_banks'),
  planFile: path.join(__dirname, 'generation_plan.json'),
  reportDir: path.join(__dirname, '../../audit_output_mass/data_gen_plan_20260116_182749'),
};

interface LintResult {
  bank: string;
  category: string;
  enCount: number;
  ptCount: number;
  targetCount: number;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

interface ParityReport {
  timestamp: string;
  totalBanks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: LintResult[];
  parityScore: number;
}

// ============================================================================
// LINTER
// ============================================================================

class ParityLinter {
  private plan: any;
  private results: LintResult[] = [];

  constructor() {
    if (fs.existsSync(CONFIG.planFile)) {
      this.plan = JSON.parse(fs.readFileSync(CONFIG.planFile, 'utf-8'));
    } else {
      console.error('ERROR: generation_plan.json not found');
      process.exit(1);
    }
  }

  lint(): ParityReport {
    console.log('='.repeat(60));
    console.log('Parity Linter v2');
    console.log('='.repeat(60));
    console.log(`Data directory: ${CONFIG.dataDir}\n`);

    // Lint routing triggers
    this.lintRoutingTriggers();

    // Lint overlays
    this.lintOverlays();

    // Lint negative patterns
    this.lintNegatives();

    // Lint formatting constraints
    this.lintFormatting();

    // Lint normalizers (shared, no parity needed)
    this.lintNormalizers();

    // Lint lexicons
    this.lintLexicons();

    // Generate report
    const report = this.generateReport();
    this.printSummary(report);

    return report;
  }

  private lintRoutingTriggers(): void {
    console.log('\n--- Routing Triggers ---');
    const intents = this.plan.routing_triggers.intents;

    for (const [intentName, config] of Object.entries(intents) as [string, any][]) {
      const enFile = path.join(CONFIG.dataDir, 'triggers', `${intentName}.en.json`);
      const ptFile = path.join(CONFIG.dataDir, 'triggers', `${intentName}.pt.json`);

      const enCount = this.countPatterns(enFile);
      const ptCount = this.countPatterns(ptFile);
      const target = config.count;

      this.addResult('triggers', intentName, enCount, ptCount, target);
    }
  }

  private lintOverlays(): void {
    console.log('\n--- Overlays ---');
    const types = this.plan.overlays.types;

    for (const [typeName, config] of Object.entries(types) as [string, any][]) {
      const enFile = path.join(CONFIG.dataDir, 'triggers', `overlay_${typeName}.en.json`);
      const ptFile = path.join(CONFIG.dataDir, 'triggers', `overlay_${typeName}.pt.json`);

      const enCount = this.countPatterns(enFile);
      const ptCount = this.countPatterns(ptFile);
      const target = config.count;

      this.addResult('overlays', typeName, enCount, ptCount, target);
    }
  }

  private lintNegatives(): void {
    console.log('\n--- Negative Patterns ---');
    const categories = this.plan.negative_patterns.categories;

    for (const [catName, config] of Object.entries(categories) as [string, any][]) {
      const enFile = path.join(CONFIG.dataDir, 'negatives', `${catName}.en.json`);
      const ptFile = path.join(CONFIG.dataDir, 'negatives', `${catName}.pt.json`);

      const enCount = this.countPatterns(enFile);
      const ptCount = this.countPatterns(ptFile);
      const target = config.count;

      this.addResult('negatives', catName, enCount, ptCount, target);
    }
  }

  private lintFormatting(): void {
    console.log('\n--- Formatting Constraints ---');
    const types = this.plan.formatting_constraints.types;

    for (const [typeName, config] of Object.entries(types) as [string, any][]) {
      const enFile = path.join(CONFIG.dataDir, 'formatting', `${typeName}.en.json`);
      const ptFile = path.join(CONFIG.dataDir, 'formatting', `${typeName}.pt.json`);

      const enCount = this.countPatterns(enFile);
      const ptCount = this.countPatterns(ptFile);
      const target = config.count;

      this.addResult('formatting', typeName, enCount, ptCount, target);
    }
  }

  private lintNormalizers(): void {
    console.log('\n--- Normalizers (shared) ---');
    const types = this.plan.normalizers.types;

    for (const [typeName, config] of Object.entries(types) as [string, any][]) {
      const file = path.join(CONFIG.dataDir, 'normalizers', `${typeName}.json`);
      const count = this.countPatterns(file);
      const target = config.count;

      // Normalizers are shared, so just check total count
      const status = count >= target * 0.8 ? (count >= target ? 'pass' : 'warn') : 'fail';
      const message = count >= target
        ? `OK: ${count}/${target}`
        : `Missing: ${count}/${target} (${Math.round((count / target) * 100)}%)`;

      console.log(`  ${typeName}: ${message}`);

      this.results.push({
        bank: 'normalizers',
        category: typeName,
        enCount: count,
        ptCount: count, // Same for shared
        targetCount: target,
        status,
        message,
      });
    }
  }

  private lintLexicons(): void {
    console.log('\n--- Domain Lexicons ---');
    const domains = this.plan.domain_lexicons.domains;

    for (const [domainName, config] of Object.entries(domains) as [string, any][]) {
      const file = path.join(CONFIG.dataDir, 'lexicons', `${domainName}.json`);
      const terms = this.loadTerms(file);
      const target = config.count;

      // Check EN and PT alias coverage
      let enWithAliases = 0;
      let ptWithAliases = 0;

      for (const term of terms) {
        if (term.aliases_en?.length > 0) enWithAliases++;
        if (term.aliases_pt?.length > 0) ptWithAliases++;
      }

      const totalCount = terms.length;
      const ptCoverage = totalCount > 0 ? ptWithAliases / totalCount : 0;
      const minPtCoverage = 0.85; // 85% minimum

      const status = totalCount >= target && ptCoverage >= minPtCoverage ? 'pass' :
                    (totalCount >= target * 0.8 && ptCoverage >= 0.7 ? 'warn' : 'fail');

      const message = `${totalCount}/${target} terms, PT coverage: ${Math.round(ptCoverage * 100)}%`;
      console.log(`  ${domainName}: ${message}`);

      this.results.push({
        bank: 'lexicons',
        category: domainName,
        enCount: enWithAliases,
        ptCount: ptWithAliases,
        targetCount: target,
        status,
        message,
      });
    }
  }

  private countPatterns(filePath: string): number {
    if (!fs.existsSync(filePath)) {
      return 0;
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return Array.isArray(data) ? data.length : 0;
    } catch {
      return 0;
    }
  }

  private loadTerms(filePath: string): any[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private addResult(
    bank: string,
    category: string,
    enCount: number,
    ptCount: number,
    target: number
  ): void {
    const parityOk = ptCount >= enCount;
    const targetOk = enCount >= target && ptCount >= target;

    let status: 'pass' | 'fail' | 'warn';
    let message: string;

    if (!parityOk) {
      status = 'fail';
      message = `PARITY FAIL: EN=${enCount}, PT=${ptCount} (PT < EN)`;
    } else if (!targetOk) {
      const minCount = Math.min(enCount, ptCount);
      if (minCount >= target * 0.8) {
        status = 'warn';
        message = `LOW: EN=${enCount}, PT=${ptCount} (target: ${target})`;
      } else {
        status = 'fail';
        message = `MISSING: EN=${enCount}, PT=${ptCount} (target: ${target})`;
      }
    } else {
      status = 'pass';
      message = `OK: EN=${enCount}, PT=${ptCount}`;
    }

    const icon = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';
    console.log(`  ${icon} ${category}: ${message}`);

    this.results.push({
      bank,
      category,
      enCount,
      ptCount,
      targetCount: target,
      status,
      message,
    });
  }

  private generateReport(): ParityReport {
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warn').length;
    const total = this.results.length;

    return {
      timestamp: new Date().toISOString(),
      totalBanks: total,
      passed,
      failed,
      warnings,
      results: this.results,
      parityScore: total > 0 ? Math.round((passed / total) * 100) : 0,
    };
  }

  private printSummary(report: ParityReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('PARITY REPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total banks: ${report.totalBanks}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Warnings: ${report.warnings}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Parity Score: ${report.parityScore}%`);

    if (report.failed > 0) {
      console.log('\n❌ PARITY CHECK FAILED');
      console.log('The following banks have parity issues:');
      for (const r of report.results.filter(r => r.status === 'fail')) {
        console.log(`  - ${r.bank}/${r.category}: ${r.message}`);
      }
    } else if (report.warnings > 0) {
      console.log('\n⚠️ PARITY CHECK PASSED WITH WARNINGS');
    } else {
      console.log('\n✅ PARITY CHECK PASSED');
    }
  }

  saveReport(report: ParityReport): void {
    if (!fs.existsSync(CONFIG.reportDir)) {
      fs.mkdirSync(CONFIG.reportDir, { recursive: true });
    }

    // Save JSON report
    const jsonPath = path.join(CONFIG.reportDir, 'parity_report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Save Markdown report
    const mdPath = path.join(CONFIG.reportDir, 'PARITY_REPORT.md');
    const md = this.generateMarkdownReport(report);
    fs.writeFileSync(mdPath, md);

    console.log(`\nReports saved to:`);
    console.log(`  - ${jsonPath}`);
    console.log(`  - ${mdPath}`);
  }

  private generateMarkdownReport(report: ParityReport): string {
    const lines: string[] = [
      '# Parity Report',
      '',
      `Generated: ${report.timestamp}`,
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Banks | ${report.totalBanks} |`,
      `| Passed | ${report.passed} |`,
      `| Warnings | ${report.warnings} |`,
      `| Failed | ${report.failed} |`,
      `| **Parity Score** | **${report.parityScore}%** |`,
      '',
      '## Results by Bank',
      '',
    ];

    // Group by bank
    const byBank = new Map<string, LintResult[]>();
    for (const r of report.results) {
      if (!byBank.has(r.bank)) byBank.set(r.bank, []);
      byBank.get(r.bank)!.push(r);
    }

    for (const [bank, results] of byBank) {
      lines.push(`### ${bank}`);
      lines.push('');
      lines.push('| Category | EN | PT | Target | Status |');
      lines.push('|----------|----|----|--------|--------|');

      for (const r of results) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
        lines.push(`| ${r.category} | ${r.enCount} | ${r.ptCount} | ${r.targetCount} | ${icon} |`);
      }
      lines.push('');
    }

    // Failed items
    const failed = report.results.filter(r => r.status === 'fail');
    if (failed.length > 0) {
      lines.push('## Failed Items');
      lines.push('');
      for (const r of failed) {
        lines.push(`- **${r.bank}/${r.category}**: ${r.message}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputReport = args.includes('--report');

  const linter = new ParityLinter();
  const report = linter.lint();

  if (outputReport) {
    linter.saveReport(report);
  }

  // Exit with error code if failed
  if (report.failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
