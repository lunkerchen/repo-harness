import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  clearRegisteredChecks,
  formatDoctor,
  registerCheck,
  runDoctor,
} from '../../src/cli/commands/doctor';

function withTempHome(fn: (home: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-dev-doctor-')));
  const prev = process.env.HOME;
  process.env.HOME = tmp;
  try {
    fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

afterEach(() => {
  clearRegisteredChecks();
});

describe('doctor command (Phase 1C)', () => {
  test('runDoctor emits the built-in checks (path/version/hosts/trust)', () => {
    withTempHome(() => {
      const r = runDoctor();
      const ids = r.checks.map((c) => c.id);
      expect(ids).toContain('cli-on-path');
      expect(ids).toContain('cli-version');
      expect(ids).toContain('codex-adapter');
      expect(ids).toContain('claude-adapter');
      expect(ids).toContain('codex-trust-state');
    });
  });

  test('codex-trust-state reports n/a when ~/.codex/config.toml is missing', () => {
    withTempHome(() => {
      const r = runDoctor();
      const trust = r.checks.find((c) => c.id === 'codex-trust-state')!;
      expect(trust.status).toBe('na');
    });
  });

  test('codex-trust-state counts user-level [hooks.state] lines when present', () => {
    withTempHome((home) => {
      const configPath = path.join(home, '.codex/config.toml');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      const content = `[features]\nhooks = true\n\n[hooks.state."${home}/.codex/hooks.json:pre_tool_use:0:0"]\ntrusted_hash = "sha256:a"\n\n[hooks.state."${home}/.codex/hooks.json:post_tool_use:0:0"]\ntrusted_hash = "sha256:b"\n\n[hooks.state."${home}/.codex/hooks.json:session_start:0:0"]\ntrusted_hash = "sha256:c"\n`;
      fs.writeFileSync(configPath, content);
      const r = runDoctor();
      const trust = r.checks.find((c) => c.id === 'codex-trust-state')!;
      expect(trust.status).toBe('ok');
      expect(trust.detail).toContain('3');
    });
  });

  test('registerCheck adds plugin entries (codegraph Phase 2 hook point)', () => {
    withTempHome(() => {
      registerCheck({
        id: 'codegraph-test',
        describe: 'placeholder for Phase 2 wiring',
        run: () => ({ status: 'ok', detail: 'plugin reachable' }),
      });
      const r = runDoctor();
      const plugin = r.checks.find((c) => c.id === 'codegraph-test');
      expect(plugin).toBeDefined();
      expect(plugin!.status).toBe('ok');
      expect(plugin!.detail).toBe('plugin reachable');
    });
  });

  test('summary tallies each status correctly', () => {
    withTempHome(() => {
      registerCheck({ id: 'ok-a', describe: '', run: () => ({ status: 'ok', detail: '' }) });
      registerCheck({ id: 'fail-b', describe: '', run: () => ({ status: 'fail', detail: '' }) });
      registerCheck({ id: 'na-c', describe: '', run: () => ({ status: 'na', detail: '' }) });
      const r = runDoctor();
      const totalReported =
        r.summary.ok + r.summary.warn + r.summary.fail + r.summary.na;
      expect(totalReported).toBe(r.checks.length);
      expect(r.summary.fail).toBeGreaterThanOrEqual(1);
    });
  });

  test('formatDoctor includes a Summary line', () => {
    withTempHome(() => {
      const text = formatDoctor(runDoctor(), false);
      expect(text).toContain('Summary:');
    });
  });

  test('formatDoctor --json produces parseable JSON', () => {
    withTempHome(() => {
      const json = formatDoctor(runDoctor(), true);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed.summary).toBeDefined();
    });
  });
});
