import { createHash } from "crypto";
import { existsSync, statSync } from "fs";
import { join } from "path";

export interface FingerprintEntry {
  readonly path: string;
  readonly exists: boolean;
  readonly size?: number;
  readonly mtimeMs?: number;
}

export interface FingerprintReport {
  readonly algorithm: "sha256";
  readonly value: string;
  readonly entries: readonly FingerprintEntry[];
}

export function fingerprintFiles(repoRoot: string, paths: readonly string[]): FingerprintReport {
  const entries: FingerprintEntry[] = [];
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) {
    const full = join(repoRoot, path);
    if (!existsSync(full)) {
      entries.push({ path, exists: false });
      hash.update(`${path}\0missing\0`);
      continue;
    }
    const stat = statSync(full);
    const entry = { path, exists: true, size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) };
    entries.push(entry);
    hash.update(`${path}\0${entry.size}\0${entry.mtimeMs}\0`);
  }
  return { algorithm: "sha256", value: hash.digest("hex"), entries };
}
