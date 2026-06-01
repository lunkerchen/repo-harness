import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  buildGlobalRuntimeArgs,
  runGlobalRuntimeSetup,
  validateHookProfile,
} from '../../src/cli/commands/global-runtime';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src/cli/index.ts');

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

describe('init command global runtime bootstrap', () => {
  test('builds the packaged setup script argv for first-run global bootstrap', () => {
    expect(buildGlobalRuntimeArgs({ hooks: 'standard' })).toEqual(['--hooks', 'standard']);
    expect(buildGlobalRuntimeArgs({ hooks: false })).toEqual(['--no-hooks']);
    expect(buildGlobalRuntimeArgs({
      withOptional: true,
      withObsidian: true,
      hooks: 'biome',
      lsp: 'typescript-lsp',
      projectType: 'plan-b',
    })).toEqual([
      '--with-optional',
      '--with-obsidian',
      '--hooks',
      'biome',
      '--lsp',
      'typescript-lsp',
      '--project-type',
      'plan-b',
    ]);
  });

  test('validates known hook profiles before running a mutating init', () => {
    expect(validateHookProfile('standard')).toBeNull();
    expect(validateHookProfile('minimal')).toBeNull();
    expect(validateHookProfile('biome')).toBeNull();
    expect(validateHookProfile('biome-strict')).toBeNull();
    expect(validateHookProfile('none')).toBeNull();
    expect(validateHookProfile(false)).toBeNull();
    expect(validateHookProfile('broad')).toContain('invalid --hooks "broad"');
  });

  test('runs the packaged setup script without requiring a source clone', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-'));
    const source = join(tmp, 'node_modules', 'repo-harness');
    const logFile = join(tmp, 'args.log');
    try {
      mkdirSync(join(source, 'scripts'), { recursive: true });
      writeExecutable(
        join(source, 'scripts', 'setup-plugins.sh'),
        [
          '#!/bin/bash',
          'set -euo pipefail',
          `printf '%s\\n' "$*" > "${logFile}"`,
          'echo init-ok',
          '',
        ].join('\n'),
      );

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        hooks: 'standard',
        withOptional: true,
        projectType: 'plan-b',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('init-ok');
      expect(readFileSync(logFile, 'utf-8')).toBe('--with-optional --hooks standard --project-type plan-b\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('reports a missing packaged setup script as a command failure', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-missing-'));
    try {
      const result = runGlobalRuntimeSetup({ sourceRoot: tmp, hooks: 'standard' });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('script not found');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI exposes init help for npx users', () => {
    const res = spawnSync('bun', [CLI, 'init', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness init');
    expect(res.stdout).toContain('--hooks <profile>');
    expect(res.stdout).toContain('--project-type <type>');
  });
});
