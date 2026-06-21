import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  DEFAULT_MINIMAL_CHANGE_POLICY,
  loadMinimalChangePolicy,
  normalizeMinimalChangePolicy,
} from '../src/cli/hook/minimal-change-policy';

describe('minimal-change policy', () => {
  test('defaults to advisory and non-blocking', () => {
    const policy = normalizeMinimalChangePolicy(undefined);
    expect(policy.mode).toBe('advice');
    expect(policy.blocking).toBe(false);
    expect(policy.session_context).toBe(true);
    expect(policy.report_path).toBe('.ai/harness/checks/minimal-change.latest.json');
  });

  test('supports explicit off mode', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'off', session_context: false });
    expect(policy.mode).toBe('off');
    expect(policy.session_context).toBe(false);
  });

  test('normalizes v1 enforce to advice without blocking', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'enforce' });
    expect(policy.mode).toBe('advice');
    expect(policy.requestedMode).toBe('enforce');
    expect(policy.blocking).toBe(false);
    expect(policy.warnings.join('\n')).toContain('enforce is not supported');
  });

  test('bounds numeric fields and keeps report path under .ai/harness', () => {
    const policy = normalizeMinimalChangePolicy({
      max_findings: 100,
      max_context_words: 10,
      report_path: '../outside.json',
    });
    expect(policy.max_findings).toBe(20);
    expect(policy.max_context_words).toBe(60);
    expect(policy.report_path).toBe(DEFAULT_MINIMAL_CHANGE_POLICY.report_path);
    expect(policy.warnings.join('\n')).toContain('report_path');
  });

  test('loads repo policy and fail-opens on malformed JSON', () => {
    const repo = mkdtempSync(join(tmpdir(), 'minimal-change-policy-'));
    mkdirSync(join(repo, '.ai/harness'), { recursive: true });

    writeFileSync(
      join(repo, '.ai/harness/policy.json'),
      JSON.stringify({ minimal_change: { mode: 'off' } }, null, 2),
    );
    expect(loadMinimalChangePolicy(repo).mode).toBe('off');

    writeFileSync(join(repo, '.ai/harness/policy.json'), '{not-json');
    expect(loadMinimalChangePolicy(repo).mode).toBe('advice');
  });
});
