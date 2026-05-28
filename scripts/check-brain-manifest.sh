#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-brain-manifest.sh [--manifest PATH] [--require-root]

Validates the repo-local external knowledge manifest. The manifest describes
stable repo documents that an agent may explicitly sync into ~/brain/<project>/*.
USAGE_EOF
}

manifest_path=".ai/harness/brain-manifest.json"
require_root=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      manifest_path="${2:-}"
      shift 2
      ;;
    --require-root|--require-vault)
      require_root=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

resolve_js_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi
  return 1
}

runtime="$(resolve_js_runtime || true)"
if [[ -z "$runtime" ]]; then
  echo "[brain] Missing node or bun to read brain manifest: $manifest_path"
  exit 1
fi

"$runtime" - "$manifest_path" "$require_root" <<'JS_EOF'
const fs = require("fs");
const path = require("path");
const os = require("os");

const [, , manifestArg, requireRootArg] = process.argv;
const requireRoot = requireRootArg === "1";
const repoRoot = process.cwd();
const manifestPath = path.resolve(repoRoot, manifestArg || ".ai/harness/brain-manifest.json");
const policyPath = path.resolve(repoRoot, ".ai/harness/policy.json");
const brainRoot = path.resolve(process.env.REPO_HARNESS_BRAIN_ROOT || path.join(os.homedir(), "brain"));
let issues = 0;

function issue(message) {
  console.log(`[brain] ${message}`);
  issues += 1;
}

function warn(message) {
  console.log(`[brain] warning: ${message}`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    issue(`Cannot read ${label}: ${path.relative(repoRoot, filePath) || filePath}`);
    return null;
  }
}

function normalizeRel(filePath) {
  return path.relative(repoRoot, path.resolve(repoRoot, filePath)).replaceAll(path.sep, "/");
}

function hasDuplicate(values) {
  return values.some((value, index) => value && values.indexOf(value) !== index);
}

function unsafeRepoPath(value) {
  const raw = String(value || "");
  if (!raw || raw.includes("\n") || raw.includes("\r") || path.isAbsolute(raw)) return true;
  const normalized = path.normalize(raw);
  return normalized === ".." || normalized.startsWith(`..${path.sep}`);
}

function checkBrainPath(value, label) {
  const raw = String(value || "");
  if (raw.startsWith("icloud/brain/")) {
    warn(`${label} uses legacy icloud/brain/ prefix; migrate it to brain/.`);
    return;
  }
  if (!raw.startsWith("brain/")) issue(`${label} must start with brain/: ${raw || "(empty)"}`);
}

if (!fs.existsSync(manifestPath)) {
  issue(`Missing brain manifest: ${normalizeRel(manifestPath)}`);
  process.exit(1);
}

const manifest = readJson(manifestPath, "brain manifest");
const policy = fs.existsSync(policyPath) ? readJson(policyPath, "harness policy") : null;
if (!manifest) process.exit(1);

const externalKnowledge = policy?.information_lifecycle?.external_knowledge || {};
const policyManifest = externalKnowledge.manifest_file;
if (policyManifest && policyManifest !== normalizeRel(manifestPath)) {
  issue(`Policy external_knowledge.manifest_file points to ${policyManifest}, expected ${normalizeRel(manifestPath)}`);
}

if (!manifest.version) issue("Brain manifest is missing version");
if (!manifest.project) issue("Brain manifest is missing project");
if (!manifest.default_brain_path) issue("Brain manifest is missing default_brain_path");
else checkBrainPath(manifest.default_brain_path.replace(/\/\*$/, "/"), "default_brain_path");
if (!Array.isArray(manifest.entries)) issue("Brain manifest entries must be an array");
if (manifest.groups !== undefined && !Array.isArray(manifest.groups)) issue("Brain manifest groups must be an array");
if (manifest.exclusions !== undefined && !Array.isArray(manifest.exclusions)) issue("Brain manifest exclusions must be an array");

const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const groups = Array.isArray(manifest.groups) ? manifest.groups : [];

if (hasDuplicate(entries.map((entry) => entry.id))) issue("Brain manifest contains duplicate entry ids");
if (hasDuplicate(groups.map((group) => group.id))) issue("Brain manifest contains duplicate group ids");

for (const pattern of Array.isArray(manifest.exclusions) ? manifest.exclusions : []) {
  if (unsafeRepoPath(pattern.replace(/\*\*/g, "x").replace(/\*/g, "x"))) {
    issue(`Exclusion path is unsafe: ${pattern}`);
  }
}

for (const group of groups) {
  const id = group.id || "(missing id)";
  if (!group.id) issue("Group is missing id");
  if (!["always-sync", "archive-only", "never-sync", undefined].includes(group.lifecycle)) {
    issue(`Group ${id} has unsupported lifecycle: ${group.lifecycle}`);
  }
  const sourcePaths = Array.isArray(group.source_paths) ? group.source_paths : [];
  for (const sourcePath of sourcePaths) {
    if (unsafeRepoPath(sourcePath)) issue(`Group ${id} has unsafe source_path: ${sourcePath}`);
  }
  const globs = Array.isArray(group.source_glob) ? group.source_glob : group.source_glob ? [group.source_glob] : [];
  for (const sourceGlob of globs) {
    if (unsafeRepoPath(String(sourceGlob).replace(/\*\*/g, "x").replace(/\*/g, "x"))) {
      issue(`Group ${id} has unsafe source_glob: ${sourceGlob}`);
    }
  }
}

for (const entry of entries) {
  const id = entry.id || "(missing id)";
  const repoPath = entry.repo_path || entry.source_path || entry.sync?.source_path;
  const brainPath = entry.brain_path || entry.sync?.brain_path;
  const syncDirection = entry.sync?.direction || entry.sync_direction || "";
  if (!entry.id) issue("Entry is missing id");
  if (repoPath && unsafeRepoPath(repoPath)) issue(`Entry ${id} has unsafe repo_path: ${repoPath}`);
  if (brainPath) checkBrainPath(brainPath, `Entry ${id} brain_path`);
  if (syncDirection && syncDirection !== "repo-to-brain") {
    issue(`Entry ${id} has unsupported sync.direction: ${syncDirection}`);
  }
}

if (requireRoot && !fs.existsSync(brainRoot)) {
  issue(`brain root unavailable: ${brainRoot}`);
}

if (issues === 0) {
  console.log("[brain] OK");
  process.exit(0);
}
process.exit(1);
JS_EOF
