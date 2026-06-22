import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  IMPLEMENTATION_FINGERPRINT_SCOPE,
  buildImplementationDiffFingerprint,
  runReviewFingerprintCli,
} from '../src/cli/hook/diff-fingerprint';

function tmpRepo(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  runGit(cwd, ['init']);
  runGit(cwd, ['config', 'user.name', 'Review Freshness Test']);
  runGit(cwd, ['config', 'user.email', 'review-freshness@test.local']);
  writeFileSync(join(cwd, 'README.md'), '# Demo\n');
  runGit(cwd, ['add', 'README.md']);
  runGit(cwd, ['commit', '-m', 'init']);
  return cwd;
}

function runGit(cwd: string, args: readonly string[]): void {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  expect(res.status).toBe(0);
}

describe('review freshness fingerprint', () => {
  test('is stable across checkout roots for the same repository diff', () => {
    const source = tmpRepo('repo-harness-review-freshness-source');
    const cloneParent = mkdtempSync(join(tmpdir(), 'repo-harness-review-freshness-clone-parent-'));
    const clone = join(cloneParent, 'clone');
    try {
      runGit(cloneParent, ['clone', source, clone]);

      for (const cwd of [source, clone]) {
        writeFileSync(join(cwd, 'README.md'), '# Demo\n\nchanged\n');
        mkdirSync(join(cwd, 'src'), { recursive: true });
        writeFileSync(join(cwd, 'src/new.ts'), 'export const demo = true;\n');
      }

      const first = buildImplementationDiffFingerprint(source);
      const second = buildImplementationDiffFingerprint(clone);

      expect(first.status).toBe('ok');
      expect(first.scope).toBe(IMPLEMENTATION_FINGERPRINT_SCOPE);
      expect(first.paths).toEqual(['README.md', 'src/new.ts']);
      expect(second.paths).toEqual(first.paths);
      expect(second.fingerprint).toBe(first.fingerprint);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(cloneParent, { recursive: true, force: true });
    }
  });

  test('excludes review and check artifacts from the implementation fingerprint', () => {
    const cwd = tmpRepo('repo-harness-review-freshness-exclude');
    try {
      const clean = buildImplementationDiffFingerprint(cwd);

      mkdirSync(join(cwd, 'tasks/reviews'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/checks'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/failures'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/handoff'), { recursive: true });
      writeFileSync(join(cwd, 'tasks/reviews/demo.review.md'), '> **Recommendation**: pass\n');
      writeFileSync(join(cwd, '.ai/harness/active-plan'), 'plans/plan-demo.md\n');
      writeFileSync(join(cwd, '.ai/harness/checks/latest.json'), '{"status":"pass"}\n');
      writeFileSync(join(cwd, '.ai/harness/failures/latest.jsonl'), '{"guard":"demo"}\n');
      writeFileSync(join(cwd, '.ai/harness/handoff/current.md'), '# Handoff\n');

      const operationalOnly = buildImplementationDiffFingerprint(cwd);
      expect(operationalOnly.excluded_paths).toEqual([
        '.ai/harness/active-plan',
        '.ai/harness/checks/latest.json',
        '.ai/harness/failures/latest.jsonl',
        '.ai/harness/handoff/current.md',
        'tasks/reviews/demo.review.md',
      ]);
      expect(operationalOnly.paths).toEqual([]);
      expect(operationalOnly.fingerprint).toBe(clean.fingerprint);

      writeFileSync(join(cwd, 'README.md'), '# Demo\n\nimplementation change\n');
      const implementationChange = buildImplementationDiffFingerprint(cwd);
      expect(implementationChange.paths).toEqual(['README.md']);
      expect(implementationChange.fingerprint).not.toBe(clean.fingerprint);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('includes untracked file content in the fingerprint', () => {
    const cwd = tmpRepo('repo-harness-review-freshness-untracked');
    try {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src/new.ts'), 'export const value = 1;\n');
      const first = buildImplementationDiffFingerprint(cwd);

      writeFileSync(join(cwd, 'src/new.ts'), 'export const value = 2;\n');
      const second = buildImplementationDiffFingerprint(cwd);

      expect(first.paths).toEqual(['src/new.ts']);
      expect(second.paths).toEqual(['src/new.ts']);
      expect(second.fingerprint).not.toBe(first.fingerprint);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('CLI is fail-open for malformed arguments', () => {
    const result = runReviewFingerprintCli(['--format', 'text']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('repo-harness-hook review-fingerprint');
  });
});
