import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { Command } from 'commander';
import {
  formatMergeCheck,
  inferRepoSlug,
  runMergeCheck,
  type MergeCheckCheckState,
  type MergeCheckGithubData,
  type MergeCheckRequiredCheckState,
} from '../../core/review/merge-check';

function readFixture(file: string | undefined): MergeCheckGithubData | undefined {
  if (!file) return undefined;
  if (!existsSync(file)) throw new Error(`merge-check fixture not found: ${file}`);
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as MergeCheckGithubData
    : {};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((entry) => entry.trim()).filter(Boolean))).sort();
}

function checkState(entry: Record<string, unknown>): MergeCheckCheckState {
  const conclusion = String(entry.conclusion ?? '').toUpperCase();
  const status = String(entry.status ?? '').toUpperCase();
  const state = String(entry.state ?? '').toUpperCase();
  if (
    ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STALE'].includes(conclusion) ||
    status === 'FAILURE' ||
    ['FAILURE', 'ERROR'].includes(state)
  ) {
    return 'failed';
  }
  if (state === 'SUCCESS') return 'passed';
  if (['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(conclusion)) return 'passed';
  if (['PENDING', 'EXPECTED'].includes(state)) return 'pending';
  if (['PENDING', 'QUEUED', 'IN_PROGRESS', 'REQUESTED', 'WAITING'].includes(status)) return 'pending';
  if (status === 'COMPLETED') return 'unknown';
  return 'unknown';
}

function worstCheckState(
  left: MergeCheckRequiredCheckState | undefined,
  right: MergeCheckRequiredCheckState,
): MergeCheckRequiredCheckState {
  const rank: Record<MergeCheckRequiredCheckState, number> = {
    passed: 0,
    unknown: 1,
    pending: 2,
    missing: 3,
    failed: 4,
  };
  if (!left) return right;
  return rank[right] > rank[left] ? right : left;
}

function checkNames(entry: Record<string, unknown>): string[] {
  const names = [
    stringField(entry, 'name'),
    stringField(entry, 'context'),
    stringField(entry, 'displayName'),
  ];
  const workflow = stringField(entry, 'workflowName');
  const name = stringField(entry, 'name');
  if (workflow && name && workflow !== name) names.push(`${workflow} / ${name}`);
  return uniqueStrings(names.filter((value): value is string => Boolean(value)));
}

function checkStatusesFromRollup(value: unknown): Record<string, MergeCheckRequiredCheckState> {
  if (!Array.isArray(value)) return {};
  const statuses: Record<string, MergeCheckRequiredCheckState> = {};
  for (const rawEntry of value) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const state = checkState(entry);
    for (const name of checkNames(entry)) {
      statuses[name] = worstCheckState(statuses[name], state);
    }
  }
  return statuses;
}

function checksFromRollup(value: unknown): MergeCheckGithubData['checks'] {
  if (!Array.isArray(value)) return 'unknown';
  if (value.length === 0) return 'unknown';
  const states = value.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry)).map(checkState);
  if (states.length === 0) return 'unknown';
  if (states.includes('failed')) return 'failed';
  if (states.includes('pending')) return 'pending';
  if (states.includes('unknown')) return 'unknown';
  return 'passed';
}

function ghJson(args: readonly string[]): unknown | undefined {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out ? JSON.parse(out) as unknown : undefined;
  } catch {
    return undefined;
  }
}

function branchProtectionContexts(value: unknown, errors: string[]): { complete: boolean; contexts: string[] } {
  const root = asRecord(value);
  const rawErrors = root?.errors;
  if (!root || (Array.isArray(rawErrors) && rawErrors.length > 0)) {
    errors.push('branch protection GraphQL query failed');
    return { complete: false, contexts: [] };
  }
  const repository = asRecord(root.repository);
  if (!repository || !Object.prototype.hasOwnProperty.call(repository, 'ref')) {
    errors.push('branch protection GraphQL response is incomplete');
    return { complete: false, contexts: [] };
  }
  if (repository.ref === null) {
    errors.push('base branch ref is unavailable for branch protection query');
    return { complete: false, contexts: [] };
  }
  const ref = asRecord(repository.ref);
  if (!ref) {
    errors.push('branch protection ref response is incomplete');
    return { complete: false, contexts: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(ref, 'branchProtectionRule')) {
    errors.push('branch protection rule response is incomplete');
    return { complete: false, contexts: [] };
  }
  if (ref.branchProtectionRule === null) {
    return { complete: true, contexts: [] };
  }
  const rule = asRecord(ref.branchProtectionRule);
  if (!rule) {
    errors.push('branch protection rule response is incomplete');
    return { complete: false, contexts: [] };
  }
  const contexts: string[] = [];
  const hasContextList = Object.prototype.hasOwnProperty.call(rule, 'requiredStatusCheckContexts');
  const hasCheckList = Object.prototype.hasOwnProperty.call(rule, 'requiredStatusChecks');
  if (!hasContextList && !hasCheckList) {
    errors.push('branch protection required checks response is incomplete');
    return { complete: false, contexts: [] };
  }
  if (hasContextList && !Array.isArray(rule.requiredStatusCheckContexts)) {
    errors.push('branch protection requiredStatusCheckContexts response is incomplete');
    return { complete: false, contexts: [] };
  }
  if (hasCheckList && !Array.isArray(rule.requiredStatusChecks)) {
    errors.push('branch protection requiredStatusChecks response is incomplete');
    return { complete: false, contexts: [] };
  }
  if (Array.isArray(rule.requiredStatusCheckContexts)) {
    for (const context of rule.requiredStatusCheckContexts) {
      if (typeof context === 'string' && context.trim()) contexts.push(context.trim());
    }
  }
  if (Array.isArray(rule.requiredStatusChecks)) {
    for (const check of rule.requiredStatusChecks) {
      const context = asRecord(check)?.context;
      if (typeof context === 'string' && context.trim()) contexts.push(context.trim());
    }
  }
  return { complete: true, contexts: uniqueStrings(contexts) };
}

function branchRuleContexts(value: unknown, errors: string[]): { complete: boolean; contexts: string[] } {
  if (!Array.isArray(value)) {
    errors.push('branch rules REST query failed');
    return { complete: false, contexts: [] };
  }
  const contexts: string[] = [];
  for (const rawRule of value) {
    const rule = asRecord(rawRule);
    if (!rule || rule.type !== 'required_status_checks') continue;
    const parameters = asRecord(rule.parameters);
    const required = parameters?.required_status_checks;
    if (!Array.isArray(required)) {
      errors.push('branch rules required_status_checks response is incomplete');
      return { complete: false, contexts: [] };
    }
    for (const rawCheck of required) {
      const context = asRecord(rawCheck)?.context;
      if (typeof context === 'string' && context.trim()) contexts.push(context.trim());
    }
  }
  return { complete: true, contexts: uniqueStrings(contexts) };
}

function requiredChecksFromGithub(
  owner: string,
  name: string,
  baseBranch: string | undefined,
  rollup: unknown,
): NonNullable<MergeCheckGithubData['required_checks']> {
  const errors: string[] = [];
  if (!baseBranch) {
    return {
      complete: false,
      contexts: [],
      statuses: {},
      missing: [],
      source: 'branch_protection+branch_rules',
      errors: ['PR base branch is unavailable for required check query'],
    };
  }

  const protectionQuery = 'query($owner:String!,$name:String!,$qualifiedName:String!){repository(owner:$owner,name:$name){ref(qualifiedName:$qualifiedName){branchProtectionRule{requiredStatusCheckContexts requiredStatusChecks{context}}}}}';
  const protection = branchProtectionContexts(ghJson([
    'api',
    'graphql',
    '-f',
    `query=${protectionQuery}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `qualifiedName=${baseBranch}`,
  ]), errors);

  const rules = branchRuleContexts(ghJson([
    'api',
    `/repos/${owner}/${name}/rules/branches/${encodeURIComponent(baseBranch)}?per_page=100`,
  ]), errors);

  const contexts = uniqueStrings([...protection.contexts, ...rules.contexts]);
  const rollupStatuses = checkStatusesFromRollup(rollup);
  const statuses: Record<string, MergeCheckRequiredCheckState> = {};
  const missing: string[] = [];
  for (const context of contexts) {
    const state = rollupStatuses[context];
    statuses[context] = state ?? 'missing';
    if (!state) missing.push(context);
  }

  return {
    complete: protection.complete && rules.complete && errors.length === 0,
    contexts,
    statuses,
    missing,
    source: 'branch_protection+branch_rules',
    errors,
  };
}

function inferRepoFromOrigin(): string | undefined {
  for (const remoteName of ['origin', 'upstream']) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', remoteName], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      const slug = inferRepoSlug(remote);
      if (slug) return slug;
    } catch {
      // Try the next remote source.
    }
  }
  try {
    const remotes = execFileSync('git', ['remote', '-v'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const line of remotes.split('\n')) {
      const slug = inferRepoSlug(line);
      if (slug) return slug;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function ghGithubData(pr: number, repo: string | undefined): MergeCheckGithubData | undefined {
  const baseArgs = ['pr', 'view', String(pr), '--json', 'url,headRefOid,baseRefName,mergeStateStatus,isDraft,statusCheckRollup'];
  const prView = asRecord(ghJson(repo ? [...baseArgs, '--repo', repo] : baseArgs));
  if (!prView) return undefined;
  const prRepo = repo ?? (typeof prView.url === 'string' ? inferRepoSlug(prView.url) : undefined);
  let requiredChecks: NonNullable<MergeCheckGithubData['required_checks']> = {
    complete: false,
    contexts: [],
    statuses: {},
    missing: [],
    source: 'branch_protection+branch_rules',
    errors: ['GitHub repository slug is unavailable for required check query'],
  };
  let unresolved: number | undefined;
  const unresolvedIds: string[] = [];
  let reviewThreadsComplete = false;
  const errors: string[] = [];
  if (prRepo?.includes('/')) {
    const [owner, name] = prRepo.split('/');
    requiredChecks = requiredChecksFromGithub(
      owner,
      name,
      typeof prView.baseRefName === 'string' ? prView.baseRefName : undefined,
      prView.statusCheckRollup,
    );
    const query = 'query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{id isResolved} pageInfo{hasNextPage endCursor}}}}}';
    let cursor: string | undefined;
    unresolved = 0;
    for (let page = 0; page < 50; page += 1) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '-F',
        `number=${pr}`,
      ];
      if (cursor) args.push('-F', `cursor=${cursor}`);
      const threadData = asRecord(ghJson(args));
      const rawErrors = threadData?.errors;
      if (!threadData || (Array.isArray(rawErrors) && rawErrors.length > 0)) {
        errors.push('review thread GraphQL query failed');
        unresolved = undefined;
        break;
      }
      const threads = (((threadData.repository as Record<string, unknown> | undefined)?.pullRequest as Record<string, unknown> | undefined)?.reviewThreads as Record<string, unknown> | undefined);
      const nodes = threads?.nodes;
      const pageInfo = threads?.pageInfo as { hasNextPage?: unknown; endCursor?: unknown } | undefined;
      if (!Array.isArray(nodes) || !pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
        errors.push('review thread GraphQL response is incomplete');
        unresolved = undefined;
        break;
      }
      for (const node of nodes) {
        const entry = node as { id?: unknown; isResolved?: unknown };
        if (entry.isResolved !== true) {
          unresolved += 1;
          if (typeof entry.id === 'string') unresolvedIds.push(entry.id);
        }
      }
      if (pageInfo.hasNextPage !== true) {
        reviewThreadsComplete = true;
        break;
      }
      if (typeof pageInfo.endCursor !== 'string' || pageInfo.endCursor.trim() === '') {
        errors.push('review thread pagination cursor is missing');
        unresolved = undefined;
        break;
      }
      cursor = pageInfo.endCursor;
    }
  } else {
    errors.push('GitHub repository slug is unavailable for review thread query');
  }
  const finalPrView = asRecord(ghJson(repo ? [...baseArgs, '--repo', repo] : baseArgs));
  if (!finalPrView) errors.push('final PR head fetch failed');
  return {
    url: typeof prView.url === 'string' ? prView.url : undefined,
    head_sha: typeof prView.headRefOid === 'string' ? prView.headRefOid : undefined,
    final_head_sha: typeof finalPrView?.headRefOid === 'string' ? finalPrView.headRefOid : undefined,
    merge_state: typeof prView.mergeStateStatus === 'string' ? prView.mergeStateStatus.toLowerCase() : undefined,
    is_draft: typeof prView.isDraft === 'boolean' ? prView.isDraft : undefined,
    checks: checksFromRollup(prView.statusCheckRollup),
    required_checks: requiredChecks,
    unresolved_actionable_threads: unresolved,
    unresolved_actionable_thread_ids: unresolvedIds,
    review_threads_complete: reviewThreadsComplete,
    errors,
  };
}

export function buildReviewCommand(): Command {
  const review = new Command('review')
    .description('Review and merge-readiness helpers');

  review
    .command('merge-check')
    .description('Check PR merge readiness without merging')
    .requiredOption('--pr <number>', 'Pull request number')
    .option('--repo <owner/name>', 'GitHub repository slug; defaults to origin when possible')
    .option('--review-evidence <file>', 'Independent reviewer evidence JSON')
    .option('--authorization <file>', 'Head-bound merge authorization JSON')
    .option('--authorized', 'Legacy explicit authorization marker; does not allow merge without --authorization')
    .option('--no-fetch', 'Skip git fetch --prune')
    .option('--github-fixture <file>', 'Read GitHub PR evidence from a local JSON fixture')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      pr: string;
      repo?: string;
      reviewEvidence?: string;
      authorization?: string;
      authorized?: boolean;
      fetch?: boolean;
      githubFixture?: string;
      json?: boolean;
    }) => {
      const pr = Number(rawOpts.pr);
      if (!Number.isInteger(pr) || pr <= 0) {
        console.error('repo-harness review merge-check: --pr must be a positive integer');
        process.exit(2);
      }
      try {
        const fixture = readFixture(rawOpts.githubFixture);
        const repo = rawOpts.repo ?? inferRepoFromOrigin();
        const report = runMergeCheck({
          pr,
          repo,
          fetch: rawOpts.fetch !== false,
          authorized: rawOpts.authorized === true,
          authorizationFile: rawOpts.authorization,
          reviewEvidenceFile: rawOpts.reviewEvidence,
          githubData: fixture ?? ghGithubData(pr, repo),
        });
        console.log(formatMergeCheck(report, rawOpts.json === true));
        if (report.merge_allowed) process.exit(0);
        if (report.decision === 'ready_but_not_authorized') process.exit(3);
        if (report.decision === 'evidence_incomplete') process.exit(4);
        process.exit(2);
      } catch (error) {
        const message = (error as Error).message;
        console.log(rawOpts.json === true
          ? JSON.stringify({ schema_version: 1, status: 'fail', error: message }, null, 2)
          : `Merge check failed: ${message}`);
        process.exit(5);
      }
    });

  return review;
}
