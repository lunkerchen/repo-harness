import { ensureRepoRelativePath } from "../../effects/path-safety";
import { normalizeLaneScope, type LaneContract, type LaneDefinition } from "./schema";

export interface LaneOwnershipMatch {
  readonly lane: LaneDefinition;
  readonly scope: string;
}

export interface LaneOwnershipResult {
  readonly status: "owned" | "unassigned" | "ambiguous" | "invalid-target";
  readonly owner?: LaneOwnershipMatch;
  readonly candidates: readonly LaneOwnershipMatch[];
  readonly error?: string;
}

function scopeMatchesPath(scope: string, target: string): boolean {
  return target === scope || target.startsWith(`${scope}/`);
}

export function laneForbiddenScopes(lane: LaneDefinition, targetPath: string): readonly string[] {
  const target = ensureRepoRelativePath(targetPath);
  if (!target.ok || !target.path) return [];

  const matches: string[] = [];
  for (const rawScope of lane.forbidden_scopes ?? []) {
    const normalized = normalizeLaneScope(rawScope);
    if (normalized.ok && scopeMatchesPath(normalized.scope, target.path)) matches.push(normalized.scope);
  }
  return matches;
}

export function resolveLaneWriteOwner(contract: LaneContract, targetPath: string): LaneOwnershipResult {
  const target = ensureRepoRelativePath(targetPath);
  if (!target.ok || !target.path) {
    return { status: "invalid-target", candidates: [], error: target.error ?? "invalid target path" };
  }

  const candidates: LaneOwnershipMatch[] = [];
  for (const lane of contract.lanes) {
    for (const rawScope of lane.write_scopes ?? []) {
      const normalized = normalizeLaneScope(rawScope);
      if (normalized.ok && scopeMatchesPath(normalized.scope, target.path)) {
        candidates.push({ lane, scope: normalized.scope });
      }
    }
  }

  if (candidates.length === 0) return { status: "unassigned", candidates: [] };

  const maxLength = Math.max(...candidates.map((candidate) => candidate.scope.length));
  const mostSpecific = candidates.filter((candidate) => candidate.scope.length === maxLength);
  const laneIds = new Set(mostSpecific.map((candidate) => candidate.lane.id));
  if (laneIds.size > 1) {
    return { status: "ambiguous", candidates: mostSpecific };
  }

  return { status: "owned", owner: mostSpecific[0], candidates };
}
