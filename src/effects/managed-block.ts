import type { AppendManagedBlockOperation, ManagedBlockMarker } from "../core/adoption/operations";

export function managedBlockMarker(marker: string): ManagedBlockMarker {
  return {
    begin: `# BEGIN: ${marker}`,
    end: `# END: ${marker}`,
  };
}

export function renderManagedBlock(operation: AppendManagedBlockOperation): string {
  const marker = managedBlockMarker(operation.marker);
  return [marker.begin, operation.content.trimEnd(), marker.end].join("\n");
}

function allMarkers(operation: AppendManagedBlockOperation): readonly ManagedBlockMarker[] {
  return [managedBlockMarker(operation.marker), ...(operation.legacyMarkers ?? [])];
}

function findMarkerRange(lines: readonly string[], marker: ManagedBlockMarker): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line === marker.begin);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line === marker.end);
  if (end === -1) return { start, end: -1 };
  return { start, end };
}

export interface ManagedBlockUpdate {
  readonly ok: boolean;
  readonly changed: boolean;
  readonly content?: string;
  readonly error?: string;
}

export function upsertManagedBlock(existing: string, operation: AppendManagedBlockOperation): ManagedBlockUpdate {
  const block = renderManagedBlock(operation);
  const normalizedExisting = existing.trimEnd();
  if (normalizedExisting === block) {
    return { ok: true, changed: false, content: existing.endsWith("\n") ? existing : `${existing}\n` };
  }

  const lines = existing.split("\n");
  for (const marker of allMarkers(operation)) {
    const range = findMarkerRange(lines, marker);
    if (!range) continue;
    if (range.end === -1) {
      return { ok: false, changed: false, error: `managed block is missing end marker: ${marker.end}` };
    }
    const currentBlock = lines.slice(range.start, range.end + 1).join("\n");
    if (currentBlock === block) {
      return { ok: true, changed: false, content: existing.endsWith("\n") ? existing : `${existing}\n` };
    }
    const nextLines = [...lines.slice(0, range.start), ...block.split("\n"), ...lines.slice(range.end + 1)];
    return { ok: true, changed: true, content: `${nextLines.join("\n").trimEnd()}\n` };
  }

  const prefix = existing.trimEnd();
  const content = prefix ? `${prefix}\n\n${block}\n` : `${block}\n`;
  return { ok: true, changed: true, content };
}

export function managedBlockNeedsUpdate(existing: string, operation: AppendManagedBlockOperation): boolean {
  const update = upsertManagedBlock(existing, operation);
  return !update.ok || update.changed;
}
