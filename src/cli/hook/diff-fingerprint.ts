import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const PATCH_HASH_MAX_BUFFER = 4 * 1024 * 1024;
const UNTRACKED_HASH_MAX_BYTES = 1024 * 1024;

export interface DiffFingerprintInput {
  readonly repoRoot: string;
  readonly baseRef?: string;
  readonly paths: readonly string[];
  readonly policyVersion: number;
  readonly purpose?: string;
}

export interface DiffFingerprint {
  readonly base_ref: string;
  readonly base_rev: string;
  readonly paths: readonly string[];
  readonly staged_diff_hash: string;
  readonly unstaged_diff_hash: string;
  readonly status_hash: string;
  readonly untracked_hash: string;
  readonly fingerprint: string;
}

export const IMPLEMENTATION_FINGERPRINT_SCOPE = 'branch+staged+unstaged+untracked';

export interface ImplementationDiffFingerprint {
  readonly version: 1;
  readonly status: 'ok' | 'unknown';
  readonly scope: typeof IMPLEMENTATION_FINGERPRINT_SCOPE;
  readonly base_ref: string;
  readonly base_rev: string;
  readonly head_rev: string;
  readonly paths: readonly string[];
  readonly excluded_paths: readonly string[];
  readonly branch_diff_hash: string;
  readonly staged_diff_hash: string;
  readonly unstaged_diff_hash: string;
  readonly status_hash: string;
  readonly untracked_hash: string;
  readonly fingerprint: string;
  readonly reason?: string;
}

export interface ReviewFingerprintCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function byteCompare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

export function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort(byteCompare);
}

function gitText(repoRoot: string, args: readonly string[], maxBuffer = PATCH_HASH_MAX_BUFFER): string {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer,
    });
  } catch {
    return '';
  }
}

function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function hashUnknown(label: string): string {
  return hashText(`repo-harness:${label}:unavailable`);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(byteCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function hashJson(value: unknown): string {
  return hashText(stableJson(value));
}

function hashGitPatch(repoRoot: string, args: readonly string[], label: string): string {
  const patch = gitText(repoRoot, args, PATCH_HASH_MAX_BUFFER);
  if (!patch) return hashUnknown(label);
  return hashText(patch);
}

function hashEmptyGitPatch(): string {
  return hashText('');
}

function untrackedContentHash(repoRoot: string, paths: readonly string[]): string {
  const entries = [];
  for (const path of paths) {
    const status = gitText(repoRoot, ['status', '--porcelain=v1', '--', path]);
    if (!status.split('\n').some((line) => line.startsWith('?? '))) continue;

    const absolute = join(repoRoot, path);
    if (!existsSync(absolute)) continue;
    try {
      const stat = statSync(absolute);
      if (!stat.isFile()) continue;
      if (stat.size > UNTRACKED_HASH_MAX_BYTES) {
        entries.push({ path, large: true, size: stat.size });
        continue;
      }
      entries.push({
        path,
        sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
      });
    } catch {
      entries.push({ path, unreadable: true });
    }
  }
  return hashJson(entries);
}

export function buildDiffFingerprint(input: DiffFingerprintInput): DiffFingerprint {
  const baseRef = input.baseRef ?? 'HEAD';
  const paths = uniqueSorted(input.paths);
  const pathspec = ['--', ...paths];
  const baseRev = gitText(input.repoRoot, ['rev-parse', '--verify', baseRef]).trim() || baseRef;
  const status = paths.length > 0
    ? gitText(input.repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths])
    : '';
  const stagedDiffHash = paths.length > 0
    ? hashGitPatch(
        input.repoRoot,
        ['diff', '--cached', '--no-ext-diff', '--binary', '--find-renames', ...pathspec],
        'staged-diff',
      )
    : hashEmptyGitPatch();
  const unstagedDiffHash = paths.length > 0
    ? hashGitPatch(
        input.repoRoot,
        ['diff', '--no-ext-diff', '--binary', '--find-renames', ...pathspec],
        'unstaged-diff',
      )
    : hashEmptyGitPatch();
  const statusHash = hashText(status);
  const untrackedHash = untrackedContentHash(input.repoRoot, paths);

  const fingerprint = hashJson({
    version: 1,
    purpose: input.purpose ?? 'diff',
    base_ref: baseRef,
    base_rev: baseRev,
    paths,
    policy_version: input.policyVersion,
    staged_diff_hash: stagedDiffHash,
    unstaged_diff_hash: unstagedDiffHash,
    status_hash: statusHash,
    untracked_hash: untrackedHash,
  });

  return Object.freeze({
    base_ref: baseRef,
    base_rev: baseRev,
    paths,
    staged_diff_hash: stagedDiffHash,
    unstaged_diff_hash: unstagedDiffHash,
    status_hash: statusHash,
    untracked_hash: untrackedHash,
    fingerprint,
  });
}

function parseStatusPaths(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const rawPath = line.slice(3).trim();
    if (!rawPath) continue;
    const renameTarget = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
    if (renameTarget) paths.push(renameTarget);
  }
  return uniqueSorted(paths);
}

function parseDiffNameStatusPaths(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t').filter(Boolean);
    if (parts.length < 2) continue;
    const status = parts[0];
    const path = status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1];
    if (path) paths.push(path);
  }
  return uniqueSorted(paths);
}

function isOperationalReviewPath(path: string): boolean {
  return (
    /^tasks\/reviews\/[^/]+\.review\.md$/.test(path) ||
    path === '.ai/harness/active-plan' ||
    path === '.ai/harness/active-worktree' ||
    path === '.ai/harness/events.jsonl' ||
    path.startsWith('.ai/harness/capability-context/') ||
    path.startsWith('.ai/harness/checks/') ||
    path.startsWith('.ai/harness/failures/') ||
    path.startsWith('.ai/harness/handoff/') ||
    path.startsWith('.ai/harness/planning/') ||
    path.startsWith('.ai/harness/runs/') ||
    path === '.claude/.active-plan' ||
    path === '.claude/.session-id' ||
    path === '.claude/.trace.jsonl' ||
    path.startsWith('.claude/.codegraph-state/')
  );
}

export function buildImplementationDiffFingerprint(
  repoRoot: string,
  opts: { baseRef?: string } = {},
): ImplementationDiffFingerprint {
  const baseRef = opts.baseRef ?? 'HEAD';
  const headRev = gitText(repoRoot, ['rev-parse', '--verify', 'HEAD']).trim();
  const baseRev = gitText(repoRoot, ['rev-parse', '--verify', baseRef]).trim();
  if (!headRev || !baseRev) {
    return Object.freeze({
      version: 1 as const,
      status: 'unknown' as const,
      scope: IMPLEMENTATION_FINGERPRINT_SCOPE,
      base_ref: baseRef,
      base_rev: baseRev || baseRef,
      head_rev: headRev || 'unknown',
      paths: [],
      excluded_paths: [],
      branch_diff_hash: hashUnknown('branch-diff'),
      staged_diff_hash: hashUnknown('staged-diff'),
      unstaged_diff_hash: hashUnknown('unstaged-diff'),
      status_hash: hashUnknown('status'),
      untracked_hash: hashUnknown('untracked'),
      fingerprint: 'unknown',
      reason: 'base or HEAD could not be resolved',
    });
  }

  const branchPaths = parseDiffNameStatusPaths(
    gitText(repoRoot, ['diff', '--name-status', '--find-renames', `${baseRef}...HEAD`]),
  );
  const statusPaths = parseStatusPaths(gitText(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']));
  const allPaths = uniqueSorted([...branchPaths, ...statusPaths]);
  const excludedPaths = allPaths.filter(isOperationalReviewPath);
  const implementationPaths = allPaths.filter((path) => !isOperationalReviewPath(path));
  const diff = buildDiffFingerprint({
    repoRoot,
    baseRef,
    paths: implementationPaths,
    policyVersion: 1,
    purpose: 'implementation-review-freshness',
  });
  const branchDiffHash = implementationPaths.length > 0
    ? hashGitPatch(
        repoRoot,
        [
          'diff',
          '--no-ext-diff',
          '--binary',
          '--find-renames',
          `${baseRef}...HEAD`,
          '--',
          ...implementationPaths,
        ],
        'branch-diff',
      )
    : hashEmptyGitPatch();
  const fingerprint = hashJson({
    version: 1,
    purpose: 'implementation-review-freshness',
    scope: IMPLEMENTATION_FINGERPRINT_SCOPE,
    base_ref: diff.base_ref,
    base_rev: diff.base_rev,
    head_rev: headRev,
    paths: diff.paths,
    branch_diff_hash: branchDiffHash,
    staged_diff_hash: diff.staged_diff_hash,
    unstaged_diff_hash: diff.unstaged_diff_hash,
    status_hash: diff.status_hash,
    untracked_hash: diff.untracked_hash,
  });

  return Object.freeze({
    version: 1 as const,
    status: 'ok' as const,
    scope: IMPLEMENTATION_FINGERPRINT_SCOPE,
    base_ref: diff.base_ref,
    base_rev: diff.base_rev,
    head_rev: headRev,
    paths: diff.paths,
    excluded_paths: excludedPaths,
    branch_diff_hash: branchDiffHash,
    staged_diff_hash: diff.staged_diff_hash,
    unstaged_diff_hash: diff.unstaged_diff_hash,
    status_hash: diff.status_hash,
    untracked_hash: diff.untracked_hash,
    fingerprint,
  });
}

function reviewFingerprintUsage(): ReviewFingerprintCliResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: 'repo-harness-hook review-fingerprint [--base <ref>] [--format json]\n',
  };
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function runReviewFingerprintCli(
  argv: readonly string[],
  opts: { cwd?: string } = {},
): ReviewFingerprintCliResult {
  const allowed = new Set(['--base', '--format']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!allowed.has(arg)) return reviewFingerprintUsage();
    index += 1;
    if (index >= argv.length) return reviewFingerprintUsage();
  }

  const format = argValue(argv, '--format') ?? 'json';
  if (format !== 'json') return reviewFingerprintUsage();

  const fingerprint = buildImplementationDiffFingerprint(opts.cwd ?? process.cwd(), {
    baseRef: argValue(argv, '--base') ?? 'HEAD',
  });
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(fingerprint)}\n`,
    stderr: '',
  };
}
