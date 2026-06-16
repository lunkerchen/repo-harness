import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { WriteFileOperation } from "./operations";
import { makeOperationId } from "./operations";

export const WORKFLOW_CONTRACT_RUNTIME_PATH = ".ai/harness/workflow-contract.json";

const WORKFLOW_CONTRACT_ASSET_PATH = join(import.meta.dir, "..", "..", "..", "assets", "workflow-contract.v1.json");

function workflowContractStatus(repoRoot: string, content: string): WriteFileOperation["status"] {
  const target = resolve(repoRoot, WORKFLOW_CONTRACT_RUNTIME_PATH);
  if (!existsSync(target)) return "planned";
  return readFileSync(target, "utf-8") === content ? "skipped" : "planned";
}

export function workflowContractInstallOperation(repoRoot: string): WriteFileOperation {
  const content = readFileSync(WORKFLOW_CONTRACT_ASSET_PATH, "utf-8");
  return {
    id: makeOperationId("writeFile", WORKFLOW_CONTRACT_RUNTIME_PATH, "workflow-contract"),
    kind: "writeFile",
    path: WORKFLOW_CONTRACT_RUNTIME_PATH,
    content,
    reason: "Install canonical repo-harness workflow contract manifest",
    risk: "low",
    status: workflowContractStatus(repoRoot, content),
  };
}
