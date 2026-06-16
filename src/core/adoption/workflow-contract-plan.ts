import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { WriteFileOperation } from "./operations";
import { makeOperationId } from "./operations";
import { readWorkflowContractAsset } from "./workflow-contract-asset";

export const WORKFLOW_CONTRACT_RUNTIME_PATH = ".ai/harness/workflow-contract.json";

function workflowContractStatus(repoRoot: string, content: string): WriteFileOperation["status"] {
  const target = resolve(repoRoot, WORKFLOW_CONTRACT_RUNTIME_PATH);
  if (!existsSync(target)) return "planned";
  return readFileSync(target, "utf-8") === content ? "skipped" : "planned";
}

export function workflowContractInstallOperation(repoRoot: string): WriteFileOperation {
  const content = readWorkflowContractAsset();
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
