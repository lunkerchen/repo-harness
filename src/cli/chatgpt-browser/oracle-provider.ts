import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { BrowserConsultInput, BrowserImportedArtifact, PromptBundle } from './types';

export interface OracleProviderResult {
  status: 'completed' | 'recoverable' | 'failed';
  output: string;
  conversationUrl?: string;
  providerSessionId?: string;
  oracleBinary?: string;
  oracleVersion?: string;
  artifacts?: BrowserImportedArtifact[];
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
  command: string[];
}

export interface OracleResolution {
  /** Absolute path to the resolved oracle binary, or undefined when none is found. */
  binary?: string;
  /** Which source in the fixed resolution order provided the binary. */
  source?: '--oracle-bin' | 'REPO_HARNESS_ORACLE_BIN' | 'node_modules/.bin' | 'PATH';
}

export interface OracleCapabilities {
  browserEngine: boolean;
  manualLogin: boolean;
  writeOutput: boolean;
  browserFollowup: boolean;
  sessionFollowup: boolean;
}

export interface OracleProbe {
  binary: string;
  version?: string;
  /** True when the binary responded to a `--help`/`--version` probe at all. */
  nodeCompatible: boolean;
  capabilities: OracleCapabilities;
  helpText: string;
}

/**
 * Resolve the oracle binary through a fixed, auditable order. We never implicitly
 * download or `npx`-execute an unpinned oracle; a missing binary is a hard,
 * actionable failure (`ORACLE_NOT_INSTALLED`).
 */
export function resolveOracleBin(input: Pick<BrowserConsultInput, 'repoRoot' | 'oracleBin'>): OracleResolution {
  if (input.oracleBin && existsSync(input.oracleBin)) return { binary: input.oracleBin, source: '--oracle-bin' };
  const fromEnv = process.env.REPO_HARNESS_ORACLE_BIN;
  if (fromEnv && existsSync(fromEnv)) return { binary: fromEnv, source: 'REPO_HARNESS_ORACLE_BIN' };
  const repoLocal = join(input.repoRoot, 'node_modules', '.bin', 'oracle');
  if (existsSync(repoLocal)) return { binary: repoLocal, source: 'node_modules/.bin' };
  const onPath = Bun.which('oracle');
  if (onPath) return { binary: onPath, source: 'PATH' };
  return {};
}

function detectCapabilities(helpText: string): OracleCapabilities {
  const has = (flag: string) => helpText.includes(flag);
  return {
    browserEngine: has('--engine'),
    manualLogin: has('--browser-manual-login') || has('manual-login'),
    writeOutput: has('--write-output'),
    browserFollowup: has('--browser-follow-up'),
    sessionFollowup: has('--followup'),
  };
}

function detectVersion(text: string): string | undefined {
  return text.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0];
}

/**
 * Probe an oracle binary's help/version output to confirm it actually accepts
 * the flags we send. The probe is the readiness gate — version comparison alone
 * is not enough, because the binary may not support the browser-mode surface.
 */
export function probeOracle(binary: string): OracleProbe {
  const help = spawnSync(binary, ['--help'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const helpText = `${help.stdout ?? ''}\n${help.stderr ?? ''}`;
  const versionRun = spawnSync(binary, ['--version'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  const versionText = `${versionRun.stdout ?? ''}\n${versionRun.stderr ?? ''}`;
  const ranOk = !help.error && (help.status === 0 || helpText.trim().length > 0);
  return {
    binary,
    version: detectVersion(versionText) ?? detectVersion(helpText),
    nodeCompatible: ranOk,
    capabilities: detectCapabilities(helpText),
    helpText,
  };
}

/**
 * Build the oracle browser-mode command. All behavior is passed explicitly so we
 * never silently inherit `.oracle/config.json` defaults. `answerPath`, when given,
 * is oracle's authoritative `--write-output` answer file (an internal managed path,
 * distinct from the user's repo-relative `--write-output` copy-out).
 */
export function buildOracleCommand(input: BrowserConsultInput, answerPath?: string): string[] {
  const args = ['--engine', 'browser', '--browser-manual-login', '--browser-archive', 'never', '--prompt', input.prompt];
  if (answerPath) args.push('--write-output', answerPath);
  if (input.providerSessionId) args.push('--followup', input.providerSessionId);
  if (input.model) args.push('--model', input.model);
  if (input.thinking) args.push('--browser-thinking-time', input.thinking);
  for (const file of input.files ?? []) args.push('--file', file.path);
  for (const followup of input.followups ?? []) args.push('--browser-follow-up', followup);
  return args;
}

function extractConversationUrl(text: string): string | undefined {
  return text.match(/https:\/\/chatgpt\.com\/c\/[^\s)]+/)?.[0];
}

function extractProviderSessionId(text: string): string | undefined {
  return text.match(/\b(?:oracle[_ -]?session|session(?: id)?)[:=]\s*([A-Za-z0-9_.:-]+)/i)?.[1];
}

export function runOracleProvider(input: BrowserConsultInput, _bundle: PromptBundle): OracleProviderResult {
  const resolution = resolveOracleBin(input);
  if (input.sourceSessionId && !input.providerSessionId) {
    return {
      status: 'failed',
      output: `Oracle follow-up requires providerSessionId for source session ${input.sourceSessionId}.`,
      command: ['oracle', ...buildOracleCommand(input)],
      oracleBinary: resolution.binary,
      error: {
        code: 'ORACLE_PROVIDER_SESSION_MISSING',
        message: 'Oracle follow-up requires the upstream provider session id',
        recovery: 'Start from a session whose meta.json contains providerSessionId, or run a new browser consult.',
      },
    };
  }
  if (!resolution.binary) {
    return {
      status: 'failed',
      output: 'Oracle CLI is not installed or not visible on PATH.',
      command: ['oracle', ...buildOracleCommand(input)],
      error: {
        code: 'ORACLE_NOT_INSTALLED',
        message: 'oracle CLI could not be resolved via --oracle-bin, REPO_HARNESS_ORACLE_BIN, node_modules/.bin, or PATH',
        recovery: 'Install oracle (pin the version; do not auto-download), or pass --oracle-bin / set REPO_HARNESS_ORACLE_BIN, or rerun with --dry-run.',
      },
    };
  }

  const answerDir = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-answer-'));
  const answerPath = join(answerDir, 'answer.md');
  const args = buildOracleCommand(input, answerPath);
  const command = [resolution.binary, ...args];
  try {
    const result = spawnSync(resolution.binary, args, {
      cwd: input.repoRoot,
      encoding: 'utf-8',
      timeout: input.timeoutMs ?? 1_800_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const stdout = result.stdout?.trimEnd() ?? '';
    const stderr = result.stderr?.trimEnd() ?? '';
    const log = [stdout, stderr ? `\n[stderr]\n${stderr}` : ''].filter(Boolean).join('\n').trimEnd();
    const oracleVersion = detectVersion(`${stdout}\n${stderr}`);
    const conversationUrl = extractConversationUrl(log);
    const providerSessionId = extractProviderSessionId(log);

    // Pre/at-start failures are safe to surface as failed; the prompt never landed.
    if (result.error) {
      return {
        status: 'failed',
        output: log || result.error.message,
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        error: { code: 'ORACLE_EXEC_FAILED', message: result.error.message },
      };
    }
    if (result.status !== 0) {
      return {
        status: 'failed',
        output: log || `oracle exited with status ${result.status}`,
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        conversationUrl,
        providerSessionId,
        error: { code: 'ORACLE_EXIT_NONZERO', message: `oracle exited with status ${result.status}` },
      };
    }

    // Authority is the --write-output answer file plus the terminal exit state.
    // stdout/stderr are diagnostics only. An empty/missing answer file on a clean
    // exit means oracle submitted but capture did not land: recoverable, NOT completed.
    const answer = existsSync(answerPath) ? readFileSync(answerPath, 'utf-8') : '';
    if (answer.trim().length === 0) {
      return {
        status: 'recoverable',
        output: [
          'Oracle exited successfully but produced no answer file.',
          'The prompt may have been submitted; do not auto-retry on another provider.',
          providerSessionId ? `Oracle session: ${providerSessionId}` : '',
          log ? `\n[log]\n${log}` : '',
        ].filter(Boolean).join('\n'),
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        conversationUrl,
        providerSessionId,
        error: {
          code: 'ORACLE_CAPTURE_INCOMPLETE',
          message: 'oracle returned no answer file; the prompt may already be submitted',
          recovery: 'Reconnect with browser-followup using the saved providerSessionId instead of re-sending the prompt.',
        },
      };
    }

    return {
      status: 'completed',
      output: answer.trimEnd(),
      conversationUrl,
      providerSessionId,
      oracleBinary: resolution.binary,
      oracleVersion,
      artifacts: [],
      command,
    };
  } finally {
    rmSync(answerDir, { recursive: true, force: true });
  }
}
