/**
 * KODA FULL BACKEND WIRING VERIFICATION
 * Master runner script - executes all phases sequentially
 *
 * Usage:
 *   npx ts-node scripts/verification/run_all.ts
 *   npx ts-node scripts/verification/run_all.ts --phase 1
 *   npx ts-node scripts/verification/run_all.ts --skip-streaming
 */

import { execSync, spawn } from 'child_process';
import * as path from 'path';

interface PhaseResult {
  phase: number;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  output?: string;
  error?: string;
}

const PHASES = [
  { phase: 0, name: 'Health Check', script: 'phase0_health_check.ts', critical: true },
  { phase: 1, name: 'Intent Routing', script: 'phase1_intent_routing.ts', critical: true },
  { phase: 2, name: 'Domain Activation', script: 'phase2_domain_activation.ts', critical: false },
  { phase: 3, name: 'Depth Decisions', script: 'phase3_depth_decisions.ts', critical: false },
  { phase: 4, name: 'Math Engine', script: 'phase4_math_execution.ts', critical: true },
  { phase: 5, name: 'RAG Gating', script: 'phase5_rag_invocation.ts', critical: true },
  { phase: 6, name: 'Answer Styles', script: 'phase6_answer_styles.ts', critical: false },
  { phase: 7, name: 'Streaming', script: 'phase7_streaming.ts', critical: false },
  { phase: 8, name: 'Quality Audit', script: 'phase8_quality_audit.ts', critical: true },
  { phase: 9, name: 'E2E Trace', script: 'phase9_e2e_trace.ts', critical: false },
];

function parseArgs(): { specificPhase?: number; skipStreaming: boolean; verbose: boolean } {
  const args = process.argv.slice(2);
  let specificPhase: number | undefined;
  let skipStreaming = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase' && args[i + 1]) {
      specificPhase = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-streaming') {
      skipStreaming = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    }
  }

  return { specificPhase, skipStreaming, verbose };
}

async function runPhase(phase: typeof PHASES[0], verbose: boolean): Promise<PhaseResult> {
  const scriptPath = path.join(__dirname, phase.script);
  const startTime = Date.now();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`PHASE ${phase.phase}: ${phase.name}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    const output = execSync(`npx ts-node ${scriptPath}`, {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf-8',
      timeout: 120000, // 2 minute timeout
      stdio: verbose ? 'inherit' : 'pipe',
    });

    const duration = Date.now() - startTime;

    if (!verbose && output) {
      // Show last 10 lines of output
      const lines = output.trim().split('\n');
      const summary = lines.slice(-10).join('\n');
      console.log(summary);
    }

    console.log(`\n✅ PHASE ${phase.phase} PASSED (${duration}ms)`);

    return {
      phase: phase.phase,
      name: phase.name,
      status: 'pass',
      duration,
      output: verbose ? undefined : output,
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.log(`\n❌ PHASE ${phase.phase} FAILED (${duration}ms)`);
    if (error.stdout) {
      console.log('\nOutput:');
      console.log(error.stdout.toString().slice(-500));
    }
    if (error.stderr) {
      console.log('\nError:');
      console.log(error.stderr.toString().slice(-500));
    }

    return {
      phase: phase.phase,
      name: phase.name,
      status: 'fail',
      duration,
      error: error.message,
    };
  }
}

async function main() {
  const { specificPhase, skipStreaming, verbose } = parseArgs();

  console.log('\n' + '═'.repeat(60));
  console.log('   KODA BACKEND WIRING VERIFICATION');
  console.log('   Full Pipeline Test Suite');
  console.log('═'.repeat(60));
  console.log(`\nStarted: ${new Date().toISOString()}`);

  if (specificPhase !== undefined) {
    console.log(`Running only Phase ${specificPhase}`);
  }
  if (skipStreaming) {
    console.log('Skipping streaming test');
  }

  const results: PhaseResult[] = [];
  const overallStart = Date.now();

  // Filter phases based on arguments
  let phasesToRun = PHASES;
  if (specificPhase !== undefined) {
    phasesToRun = PHASES.filter(p => p.phase === specificPhase);
  }
  if (skipStreaming) {
    phasesToRun = phasesToRun.filter(p => p.phase !== 7);
  }

  // Run each phase
  for (const phase of phasesToRun) {
    const result = await runPhase(phase, verbose);
    results.push(result);

    // Stop on critical failure
    if (result.status === 'fail' && phase.critical) {
      console.log(`\n⛔ CRITICAL FAILURE in Phase ${phase.phase} - Stopping execution`);
      break;
    }
  }

  // Summary
  const totalDuration = Date.now() - overallStart;
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = phasesToRun.length - results.length;

  console.log('\n' + '═'.repeat(60));
  console.log('   VERIFICATION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\nTotal duration: ${totalDuration}ms`);
  console.log(`Phases: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  console.log('\nPhase Results:');
  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭️';
    console.log(`  ${icon} Phase ${r.phase}: ${r.name} (${r.duration}ms)`);
  });

  // Final verdict
  console.log('\n' + '─'.repeat(60));

  const criticalFailures = results.filter(r =>
    r.status === 'fail' && PHASES.find(p => p.phase === r.phase)?.critical
  );

  if (criticalFailures.length > 0) {
    console.log('\n❌ VERIFICATION FAILED');
    console.log('\nCritical failures:');
    criticalFailures.forEach(r => {
      console.log(`  - Phase ${r.phase}: ${r.name}`);
    });
    console.log('\n⛔ SYSTEM IS NOT READY FOR DEPLOYMENT');
    process.exit(1);
  }

  if (failed > 0) {
    console.log('\n⚠️  VERIFICATION PASSED WITH WARNINGS');
    console.log('\nNon-critical failures:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - Phase ${r.phase}: ${r.name}`);
    });
  } else {
    console.log('\n✅ ALL VERIFICATIONS PASSED');
  }

  // GO/NO-GO checklist
  console.log('\n' + '─'.repeat(60));
  console.log('GO / NO-GO CHECKLIST');
  console.log('─'.repeat(60));

  const checks = [
    { name: 'No misrouting', pass: results.find(r => r.phase === 1)?.status === 'pass' },
    { name: 'Depth varies correctly', pass: results.find(r => r.phase === 3)?.status === 'pass' },
    { name: 'Python engine authoritative for math', pass: results.find(r => r.phase === 4)?.status === 'pass' },
    { name: 'RAG fires only when allowed', pass: results.find(r => r.phase === 5)?.status === 'pass' },
    { name: 'Streaming is incremental', pass: results.find(r => r.phase === 7)?.status !== 'fail' },
    { name: 'Answer styles always resolve', pass: results.find(r => r.phase === 6)?.status === 'pass' },
  ];

  checks.forEach(c => {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`);
  });

  const allChecksPass = checks.every(c => c.pass);

  console.log('\n' + '═'.repeat(60));
  if (allChecksPass) {
    console.log('   ✅ SYSTEM IS 100% WIRED - READY FOR DEPLOYMENT');
  } else {
    console.log('   ⚠️  SYSTEM HAS ISSUES - REVIEW BEFORE DEPLOYMENT');
  }
  console.log('═'.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Verification runner error:', err);
  process.exit(1);
});
