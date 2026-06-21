import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { loadMinimalChangePolicy } from './minimal-change-policy';
import {
  renderMinimalChangePromptAdvice,
  renderMinimalChangeSessionContext,
} from './minimal-change-context';
import { collectMinimalChangeSignals } from './minimal-change-signals';

export interface MinimalChangeCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MinimalChangeCliOptions {
  readonly cwd?: string;
}

interface ParsedArgs {
  readonly action: string;
  readonly phase: string;
  readonly intent: string;
  readonly path: string;
  readonly baseRef: string;
}

function usage(): string {
  return [
    'repo-harness-hook minimal-change <context|signals|review> --phase <session|prompt|post-edit|stop>',
    '',
    'Hook-only minimal-change helper. It must fail open for hook callers.',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): ParsedArgs | { error: string } {
  const action = argv[0];
  if (!action) return { error: 'missing action' };

  const phaseIndex = argv.indexOf('--phase');
  const phase = phaseIndex >= 0 ? argv[phaseIndex + 1] : '';
  const intentIndex = argv.indexOf('--intent');
  const intent = intentIndex >= 0 ? argv[intentIndex + 1] : '';
  const pathIndex = argv.indexOf('--path');
  const path = pathIndex >= 0 ? argv[pathIndex + 1] : '';
  const baseRefIndex = argv.indexOf('--base-ref');
  const baseRef = baseRefIndex >= 0 ? argv[baseRefIndex + 1] : 'HEAD';
  if (!phase) return { error: 'missing --phase' };
  return { action, phase, intent, path, baseRef };
}

function reportPath(repoRoot: string, relPath: string): string {
  return resolve(repoRoot, relPath);
}

function reviewJson(repoRoot: string): string {
  const policy = loadMinimalChangePolicy(repoRoot);
  if (policy.mode === 'off' || !policy.stop_review) {
    return `${JSON.stringify({
      version: 1,
      verdict: 'disabled',
      findings: [],
      protected_changes: [],
      report_path: policy.report_path,
    })}\n`;
  }

  const path = reportPath(repoRoot, policy.report_path);
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      return `${JSON.stringify(parsed)}\n`;
    } catch {
      // Fall through to unknown. Stop integration must stay non-blocking.
    }
  }

  return `${JSON.stringify({
    version: 1,
    verdict: 'unknown',
    findings: [],
    protected_changes: [],
    report_path: policy.report_path,
  })}\n`;
}

export function runMinimalChangeCli(
  argv: readonly string[],
  options: MinimalChangeCliOptions = {},
): MinimalChangeCliResult {
  const repoRoot = resolve(options.cwd ?? process.env.HOOK_REPO_ROOT ?? process.cwd());
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    return { exitCode: 2, stdout: '', stderr: `${parsed.error}\n${usage()}\n` };
  }

  const policy = loadMinimalChangePolicy(repoRoot);

  if (parsed.action === 'context') {
    if (parsed.phase === 'session') {
      const context = renderMinimalChangeSessionContext(policy);
      return { exitCode: 0, stdout: context ? `${context}\n` : '', stderr: '' };
    }
    if (parsed.phase === 'prompt') {
      const advice = renderMinimalChangePromptAdvice(policy, parsed.intent);
      return { exitCode: 0, stdout: advice ? `${advice}\n` : '', stderr: '' };
    }
  }

  if (parsed.action === 'signals' && parsed.phase === 'post-edit') {
    try {
      collectMinimalChangeSignals({
        repoRoot,
        path: parsed.path,
        policy,
        baseRef: parsed.baseRef || 'HEAD',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { exitCode: 0, stdout: '', stderr: `minimal-change signals skipped: ${message}\n` };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  if (parsed.action === 'review' && parsed.phase === 'stop') {
    return { exitCode: 0, stdout: reviewJson(repoRoot), stderr: '' };
  }

  return { exitCode: 2, stdout: '', stderr: `unsupported minimal-change command\n${usage()}\n` };
}
