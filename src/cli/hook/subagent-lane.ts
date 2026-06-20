import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { isHighContextLanePath } from './lane-decision';
import {
  laneStatus,
  mergeLaneEvidence,
  type LaneGateMode,
  type LaneStatusReport,
} from '../../core/lanes/state';
import { resolveLaneWriteOwner } from '../../core/lanes/ownership-resolver';
import { normalizeLaneScope, type LaneContract, type LaneDefinition } from '../../core/lanes/schema';

export interface HookCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface SubagentSpec {
  readonly lane_id?: string;
  readonly role?: string;
  readonly target?: string;
  readonly worktree?: string;
  readonly write_scopes: readonly string[];
  readonly forbidden_scopes: readonly string[];
  readonly expected_output?: string;
  readonly required_evidence: readonly string[];
  readonly reviewed_head_sha?: string;
  readonly reviewed_lane_id?: string;
  readonly worker_lane_id?: string;
}

function parseJson(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function firstString(input: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function listValue(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').map((entry) => entry.trim());
  }
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]' || /^read[-_ ]?only$/i.test(trimmed)) return [];
  return trimmed
    .replace(/^\[|\]$/g, '')
    .split(/[,;\n]/)
    .map((entry) => entry.trim().replace(/^["'`-]+|["'`]+$/g, ''))
    .filter(Boolean);
}

function normalizeEvidenceKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseInlineFields(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const match of text.matchAll(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z0-9 _.-]{1,48})\s*:\s*(.+?)\s*$/gm)) {
    const key = normalizeEvidenceKey(match[1] ?? '');
    const value = (match[2] ?? '').trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function parseStructuredText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const raw of [trimmed, fenced].filter((entry): entry is string => typeof entry === 'string')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Fall through to line-oriented parsing.
    }
  }
  return parseInlineFields(text);
}

function specFromInput(input: Record<string, unknown>): SubagentSpec {
  const toolInput = asRecord(input.tool_input);
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
  const textFields = parseStructuredText(prompt);
  const merged = { ...textFields, ...toolInput };
  const laneId = firstString(merged, ['lane_id', 'lane', 'laneId']);
  const role = firstString(merged, ['role', 'lane_role']);
  return {
    lane_id: laneId || undefined,
    role: role || undefined,
    target: firstString(merged, ['target', 'task', 'objective']) || undefined,
    worktree: firstString(merged, ['worktree', 'worktree_root']) || undefined,
    write_scopes: listValue(merged.write_scopes ?? merged.write_scope ?? merged.writable_files ?? merged.writable),
    forbidden_scopes: listValue(merged.forbidden_scopes ?? merged.forbidden_scope ?? merged.forbidden_files),
    expected_output: firstString(merged, ['expected_output', 'output', 'deliverable']) || undefined,
    required_evidence: listValue(merged.required_evidence ?? merged.evidence),
    reviewed_head_sha: firstString(merged, ['reviewed_head_sha', 'worker_head_sha', 'head_sha']) || undefined,
    reviewed_lane_id: firstString(merged, ['reviewed_lane_id', 'reviewer_for']) || undefined,
    worker_lane_id: firstString(merged, ['worker_lane_id', 'worker_lane']) || undefined,
  };
}

function permissionJson(decision: 'allow' | 'deny', reason: string, updatedInput?: Record<string, unknown>): string {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
      ...(updatedInput ? { updatedInput } : {}),
    },
  })}\n`;
}

function promptLooksWritable(prompt: string, spec: SubagentSpec): boolean {
  if (spec.role === 'worker' || spec.write_scopes.length > 0) return true;
  return /\b(implement|edit|modify|write|change|fix|apply|worker)\b|实现|修改|写入|修复|改动/i.test(prompt);
}

function scopeOwnedByLane(contract: LaneContract, lane: LaneDefinition, rawScope: string): string | null {
  const normalized = normalizeLaneScope(rawScope);
  if (!normalized.ok) return normalized.error;
  const owner = resolveLaneWriteOwner(contract, normalized.scope);
  if (owner.status !== 'owned' || owner.owner?.lane.id !== lane.id) {
    return `write scope ${normalized.scope} is not owned by lane ${lane.id}`;
  }
  return null;
}

function validateSubagentSpec(report: LaneStatusReport, spec: SubagentSpec, prompt: string): string | null {
  if (!report.contract || report.status !== 'active') return null;
  const requiresLane = promptLooksWritable(prompt, spec) || spec.role === 'reviewer';
  if (!requiresLane && !spec.lane_id) return null;
  if (!spec.lane_id) return '[LaneSubagentGuard] writable or reviewer subagent requests must include lane_id';

  const lane = report.contract.lanes.find((entry) => entry.id === spec.lane_id);
  if (!lane) return `[LaneSubagentGuard] unknown lane_id: ${spec.lane_id}`;
  if (spec.role && spec.role !== lane.role) {
    return `[LaneSubagentGuard] requested role ${spec.role} does not match lane ${lane.id} role ${lane.role}`;
  }
  if (lane.role === 'reviewer' && spec.write_scopes.length > 0) {
    return `[LaneSubagentGuard] reviewer lane ${lane.id} must stay read-only`;
  }
  if (lane.role === 'reviewer') {
    const reviewedLane = spec.reviewed_lane_id || spec.worker_lane_id;
    if (reviewedLane === lane.id) {
      return `[LaneSubagentGuard] reviewer lane ${lane.id} cannot review itself`;
    }
    if (!spec.reviewed_head_sha) {
      return `[LaneSubagentGuard] reviewer lane ${lane.id} must name the worker reviewed_head_sha`;
    }
  }
  for (const scope of spec.write_scopes) {
    const issue = scopeOwnedByLane(report.contract, lane, scope);
    if (issue) return `[LaneSubagentGuard] ${issue}`;
    if (isHighContextLanePath(normalizeLaneScope(scope).ok ? normalizeLaneScope(scope).scope : scope) && lane.allow_high_context !== true) {
      return `[LaneSubagentGuard] high-context write scope requires allow_high_context on lane ${lane.id}`;
    }
  }
  return null;
}

function laneContractText(report: LaneStatusReport, spec: SubagentSpec): string {
  if (!report.contract || report.status !== 'active') return '';
  const lane = spec.lane_id
    ? report.contract.lanes.find((entry) => entry.id === spec.lane_id)
    : report.current_lane
      ? report.contract.lanes.find((entry) => entry.id === report.current_lane?.lane_id)
      : undefined;
  const lines = [
    '',
    '',
    '[repo-harness:lane-contract]',
    'An active lane contract exists. Spawned subagents must keep their final report structured.',
    'Include: lane_id, role, target, write_scope, forbidden_scope, expected_output, required_evidence.',
  ];
  if (lane) {
    lines.push(
      `Lane: ${lane.id}`,
      `Role: ${lane.role}`,
      `Writable: ${(lane.write_scopes ?? []).join(', ') || '(read-only)'}`,
      `Forbidden: ${(lane.forbidden_scopes ?? []).join(', ') || '(none)'}`,
      `Required evidence: ${(lane.required_evidence ?? []).join(', ') || '(contract default)'}`,
    );
    if (lane.role === 'reviewer') {
      lines.push('Reviewer requirement: cite the worker reviewed_head_sha and do not review your own worker lane.');
    }
  }
  return lines.join('\n');
}

export function runSubagentPreToolCli(stdin: string): HookCliResult {
  const input = parseJson(stdin);
  const toolName = String(input.tool_name ?? '');
  if (toolName === 'SendUserMessage') {
    const agentId = firstString(input, ['agent_id']);
    const transcriptPath = firstString(input, ['transcript_path']);
    if (!agentId && !transcriptPath.includes('/subagents/agent-')) return { stdout: '', stderr: '', exitCode: 0 };
    return {
      stdout: permissionJson('deny', 'subagent-return-channel-guard: SendUserMessage from a spawned subagent does not reach the caller Agent tool result. Put the full report in final text and end the subagent turn.'),
      stderr: '',
      exitCode: 0,
    };
  }
  if (toolName !== 'Task' && toolName !== 'Agent') return { stdout: '', stderr: '', exitCode: 0 };

  const toolInput = asRecord(input.tool_input);
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
  if (!prompt) return { stdout: '', stderr: '', exitCode: 0 };

  const spec = specFromInput(input);
  const status = laneStatus(process.cwd());
  const validationIssue = validateSubagentSpec(status, spec, prompt);
  if (validationIssue) {
    return { stdout: permissionJson('deny', validationIssue), stderr: '', exitCode: 0 };
  }

  const marker = '[repo-harness:return-channel]';
  const returnContract = ' Your final text message is the only channel returned to your caller. Put the complete findings/report in final text. Do not call SendUserMessage for report delivery; content sent through SendUserMessage is delivered outside the Agent tool result.';
  const laneText = laneContractText(status, spec);
  const nextPrompt = prompt.includes(marker)
    ? prompt
    : `${prompt}\n\n${marker}${returnContract}${laneText}`;
  if (nextPrompt === prompt) return { stdout: '', stderr: '', exitCode: 0 };
  return {
    stdout: permissionJson('allow', 'subagent-return-channel-guard: delivery and lane contract appended to spawn prompt', {
      ...toolInput,
      prompt: nextPrompt,
    }),
    stderr: '',
    exitCode: 0,
  };
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

function delegationScope(input: Record<string, unknown>): { id: string } | null {
  const runId = firstString(input, ['run_id']);
  if (runId) return { id: `run-${sanitize(runId)}` };
  const sessionId = firstString(input, ['session_id']);
  if (sessionId) return { id: `session-${sanitize(sessionId)}` };
  const transcriptPath = firstString(input, ['transcript_path']);
  if (transcriptPath) {
    return { id: `transcript-${createHash('sha1').update(transcriptPath).digest('hex').slice(0, 16)}` };
  }
  const envSession = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || '';
  return envSession ? { id: `session-${sanitize(envSession)}` } : null;
}

function markDelegationSpawned(repoRoot: string, input: Record<string, unknown>): void {
  const stateDir = join(repoRoot, '.ai', 'harness', 'delegation');
  const latestPath = join(stateDir, 'latest.json');
  if (!existsSync(latestPath)) return;
  const latest = parseJson(readFileSync(latestPath, 'utf-8'));
  const scope = delegationScope(input);
  const statePath = latest.scope_id
    ? scope?.id === latest.scope_id
      ? resolve(stateDir, String(latest.state_file || join('turns', `${latest.scope_id}.json`)))
      : ''
    : latestPath;
  if (!statePath || !statePath.startsWith(resolve(stateDir))) return;
  const state = parseJson(readFileSync(statePath, 'utf-8'));
  if (state.eligible === true && state.explicit === true && state.spawned !== true) {
    const now = new Date().toISOString();
    const next = { ...state, spawned: true, spawned_at: now, updated_at: now };
    writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
    writeFileSync(latestPath, `${JSON.stringify(next, null, 2)}\n`);
  }
}

export function runSubagentStartContextCli(stdin: string): HookCliResult {
  const input = parseJson(stdin);
  const repoRoot = process.env.HOOK_REPO_ROOT || process.cwd();
  try {
    markDelegationSpawned(repoRoot, input);
  } catch {
    // Context injection remains useful without delegation state.
  }
  const status = laneStatus(process.cwd());
  const lane = status.contract && status.current_lane
    ? status.contract.lanes.find((entry) => entry.id === status.current_lane?.lane_id)
    : undefined;
  const laneBlock = lane ? [
    '',
    '# Active Lane',
    `- Run: ${status.active_run?.run_id ?? '(unknown)'}`,
    `- Lane: ${lane.id}`,
    `- Role: ${lane.role}`,
    `- Writable: ${(lane.write_scopes ?? []).join(', ') || '(read-only)'}`,
    `- Forbidden: ${(lane.forbidden_scopes ?? []).join(', ') || '(none)'}`,
    `- Required evidence: ${(lane.required_evidence ?? []).join(', ') || '(contract default)'}`,
    ...(lane.role === 'reviewer' ? ['- Reviewer evidence must include reviewed_head_sha for the worker head under review.'] : []),
  ] : [];
  const context = [
    '[repo-harness:subagent-context]',
    '',
    'Read the active repo-harness contract before working.',
    'Stay within the assigned role and permission scope.',
    'Do not broaden the task.',
    'Explorer and reviewer roles are read-only unless the parent prompt explicitly assigns a writable worker scope.',
    ...laneBlock,
    '',
    'Return complete findings in your final response, including:',
    '- lane_id and role when a lane contract is active',
    '- files and symbols inspected',
    '- evidence',
    '- risks or uncertainty',
    '- tests or commands run when relevant',
    '- recommended parent action',
    '',
    'Do not claim overall task completion.',
  ].join('\n');
  return {
    stdout: `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: context,
      },
    })}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function messageFromInput(input: Record<string, unknown>): string {
  return firstString(input, [
    'final_message',
    'last_assistant_message',
    'subagent_result',
    'result',
    'response',
    'output',
    'message',
    'assistant_message',
  ]);
}

function blockOnce(input: Record<string, unknown>, reason: string): HookCliResult {
  const repoRoot = process.env.HOOK_REPO_ROOT || process.cwd();
  const stateDir = join(repoRoot, '.ai', 'harness', 'delegation');
  mkdirSync(stateDir, { recursive: true });
  const statePath = join(stateDir, 'subagent-stop-quality.json');
  const message = messageFromInput(input);
  const hash = createHash('sha1').update(`${reason}\n${message}`).digest('hex');
  const sessionIdentity = firstString(input, ['run_id', 'session_id', 'transcript_path']) ||
    process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || '';
  const subagentIdentity = firstString(input, ['subagent_id', 'agent_id', 'task_id', 'thread_id', 'name', 'role']);
  const scopeKey = [
    sessionIdentity ? sanitize(sessionIdentity) : 'unscoped-session',
    subagentIdentity ? sanitize(subagentIdentity) : 'unscoped-subagent',
    hash,
  ].join(':');
  try {
    const state = parseJson(readFileSync(statePath, 'utf-8'));
    if (state.last_blocked_key === scopeKey) return { stdout: '', stderr: '', exitCode: 0 };
  } catch {
    // First quality block for this result.
  }
  writeFileSync(statePath, `${JSON.stringify({
    version: 1,
    last_blocked_key: scopeKey,
    last_blocked_hash: hash,
    scope: {
      session: sessionIdentity ? sanitize(sessionIdentity) : '',
      subagent: subagentIdentity ? sanitize(subagentIdentity) : '',
    },
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`);
  return {
    stdout: `${JSON.stringify({ decision: 'block', reason })}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function genericSubagentQualityReason(message: string): string {
  const trimmed = message.trim();
  const tooThin = trimmed.length < 120;
  const looksLikeBareApproval = /^(looks good|lgtm|ok|done|no issues|all good)[.!\s]*$/i.test(trimmed);
  const mentionsUnresolvedError = /\b(error|failed|failure|blocked|exception|timeout)\b/i.test(trimmed) &&
    !/\b(risk|uncertain|recommend|next|because|原因|风险|建议|不确定)\b/i.test(trimmed);
  const hasEvidence = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+|\.(ts|tsx|js|jsx|sh|md|json|toml)\b|\b(symbols?|files?|evidence|tests?|commands?)\b|文件|证据|测试|命令)/i.test(trimmed);
  if (looksLikeBareApproval || tooThin) return 'The subagent final report is too thin for repo-harness delegation.';
  if (mentionsUnresolvedError) return 'The subagent reported an unresolved error without a risk or parent-action recommendation.';
  if (!hasEvidence && /\b(review|explore|investigate|audit|map)\b/i.test(trimmed)) {
    return 'The subagent report lacks file, symbol, command, or evidence references.';
  }
  return '';
}

export function runSubagentStopQualityCli(stdin: string): HookCliResult {
  const input = parseJson(stdin);
  if (input.stop_hook_active === true || input.subagent_stop_hook_active === true) {
    return { stdout: '', stderr: '', exitCode: 0 };
  }
  const message = messageFromInput(input);
  if (!message) return { stdout: '', stderr: '', exitCode: 0 };

  const evidence = parseStructuredText(message);
  const status = laneStatus(process.cwd());
  const evidenceLaneId = firstString(evidence, ['lane_id', 'lane', 'laneId']);
  if (status.contract && status.status === 'active') {
    if (!evidenceLaneId && /\b(lane[_ -]?id|required[_ -]?evidence|reviewed[_ -]?head[_ -]?sha)\b/i.test(message)) {
      return blockOnce(input, '[SubagentEvidenceGate] Active lane evidence report is missing lane_id.');
    }
    const lane = evidenceLaneId
      ? status.contract.lanes.find((entry) => entry.id === evidenceLaneId)
      : status.current_lane
        ? status.contract.lanes.find((entry) => entry.id === status.current_lane?.lane_id)
        : undefined;
    if (lane) {
      const reviewedLane = firstString(evidence, ['reviewed_lane_id', 'reviewer_for', 'worker_lane_id']);
      if (lane.role === 'reviewer' && reviewedLane === lane.id) {
        return blockOnce(input, `[SubagentEvidenceGate] Reviewer lane ${lane.id} cannot review itself.`);
      }
      const merged = mergeLaneEvidence(lane.id, evidence);
      if ((merged.missing?.length ?? 0) > 0) {
        return blockOnce(
          input,
          `[SubagentEvidenceGate] Lane ${lane.id} is missing structured evidence: ${merged.missing?.join(', ')}. Return a complete final response with lane_id, role, reviewed_head_sha for reviewer lanes, commands_run, findings/verdict, and parent action.`,
        );
      }
    }
  }

  const reason = genericSubagentQualityReason(message);
  if (!reason) return { stdout: '', stderr: '', exitCode: 0 };
  return blockOnce(
    input,
    `[SubagentQualityGate] ${reason} Continue the subagent once and return a complete final response with: files and symbols inspected, evidence, risks or uncertainty, tests or commands run when relevant, and recommended parent action. Do not claim overall task completion.`,
  );
}
