import { spawnSync, type StdioOptions } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const HOOK_PROFILES = ['standard', 'minimal', 'biome', 'biome-strict', 'none'] as const;
export type HookProfile = (typeof HOOK_PROFILES)[number];

export interface GlobalRuntimeOptions {
  sourceRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'pipe' | 'inherit';
  withOptional?: boolean;
  withObsidian?: boolean;
  withSuperpowers?: boolean;
  hooks?: string | false;
  lsp?: string;
  projectType?: string;
}

export interface GlobalRuntimeResult {
  exitCode: number;
  command: string[];
  stdout: string;
  stderr: string;
}

function defaultSourceRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export function buildGlobalRuntimeArgs(opts: GlobalRuntimeOptions): string[] {
  const args: string[] = [];
  if (opts.withOptional === true) args.push('--with-optional');
  if (opts.withObsidian === true) args.push('--with-obsidian');
  if (opts.withSuperpowers === true) args.push('--with-superpowers');
  if (opts.hooks === false) args.push('--no-hooks');
  else if (typeof opts.hooks === 'string') args.push('--hooks', opts.hooks);
  if (opts.lsp) args.push('--lsp', opts.lsp);
  if (opts.projectType) args.push('--project-type', opts.projectType);
  return args;
}

export function validateHookProfile(
  value: string | false | undefined,
  commandName = 'init',
): string | null {
  if (value === undefined || value === false) return null;
  return HOOK_PROFILES.includes(value as HookProfile)
    ? null
    : `repo-harness ${commandName}: invalid --hooks "${value}" (expected: ${HOOK_PROFILES.join(', ')})`;
}

export function runGlobalRuntimeSetup(opts: GlobalRuntimeOptions): GlobalRuntimeResult {
  const sourceRoot = opts.sourceRoot ?? defaultSourceRoot();
  const scriptPath = join(sourceRoot, 'scripts', 'setup-plugins.sh');
  const args = buildGlobalRuntimeArgs(opts);
  const command = ['bash', scriptPath, ...args];

  if (!existsSync(scriptPath)) {
    return {
      exitCode: 1,
      command,
      stdout: '',
      stderr: `repo-harness init: script not found at ${scriptPath}`,
    };
  }

  const result = spawnSync('bash', [scriptPath, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: (opts.stdio ?? 'pipe') as StdioOptions,
  });

  return {
    exitCode: result.status ?? 1,
    command,
    stdout: result.stdout ?? '',
    stderr: result.stderr || (result.error ? String(result.error.message || result.error) : ''),
  };
}
