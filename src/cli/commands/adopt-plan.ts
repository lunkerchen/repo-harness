import { resolve } from "path";
import type { AdoptionMode } from "../../core/adoption/modes";
import { planAdoption } from "../../core/adoption/plan";
import type { AdoptionOperation, AdoptionPlan } from "../../core/adoption/operations";
import { renderAdoptionPlanJson, renderAdoptionPlanObject, renderAdoptionPlanText } from "../../core/adoption/render";
import { applyAdoptionPlan, type ApplyAdoptionPlanResult } from "../../effects/fs-transaction";
import { validateRepoAdoptionTarget } from "./init";

export interface RunAdoptionPlanOptions {
  readonly repo?: string;
  readonly mode: AdoptionMode;
  readonly json?: boolean;
  readonly explicitRepo?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunAdoptionPlanResult {
  readonly exitCode: number;
  readonly output: string;
}

interface RunExperimentalTsApplyResult {
  readonly exitCode: number;
  readonly output: string;
}

interface ExperimentalTsApplyReport {
  readonly protocol: 1;
  readonly command: "adopt";
  readonly experimentalTsApply: true;
  readonly repoRoot: string;
  readonly mode: AdoptionMode;
  readonly ok: boolean;
  readonly plan: Record<string, unknown>;
  readonly apply?: ApplyAdoptionPlanResult;
  readonly unsupportedOperations?: readonly Record<string, unknown>[];
}

export function runAdoptionPlan(opts: RunAdoptionPlanOptions): RunAdoptionPlanResult {
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const targetError = validateRepoAdoptionTarget(repoRoot, opts.explicitRepo === true, opts.env);
  if (targetError) {
    const result = {
      exitCode: 2,
      repoRoot,
      steps: [targetError],
      lines: [`[init] failed: ${targetError.step}${targetError.detail ? ` - ${targetError.detail}` : ""}`],
    };
    return {
      exitCode: 2,
      output: opts.json === true ? `${JSON.stringify(result, null, 2)}\n` : `${result.lines.join("\n")}\n`,
    };
  }

  const plan = planAdoption({
    repoRoot,
    mode: opts.mode,
    apply: false,
  });

  return {
    exitCode: 0,
    output: opts.json === true ? renderAdoptionPlanJson(plan) : renderAdoptionPlanText(plan),
  };
}

function isSafeApplicatorOperation(operation: AdoptionOperation): boolean {
  if (operation.kind === "mkdir" || operation.kind === "appendManagedBlock") return true;
  return operation.kind === "writeFile" && operation.ifMissing === true;
}

function unsupportedSafeApplicatorOperations(plan: AdoptionPlan): readonly AdoptionOperation[] {
  return plan.operations.filter((operation) => !isSafeApplicatorOperation(operation));
}

function renderExperimentalTsApplyText(report: ExperimentalTsApplyReport): string {
  const lines = [
    `[adopt-ts-apply] repo: ${report.repoRoot}`,
    `[adopt-ts-apply] mode: ${report.mode}`,
    `[adopt-ts-apply] ok: ${report.ok ? "yes" : "no"}`,
  ];
  if (report.unsupportedOperations?.length) {
    lines.push(`[adopt-ts-apply] unsupported: ${report.unsupportedOperations.length}`);
    for (const operation of report.unsupportedOperations) {
      lines.push(`[adopt-ts-apply] unsupported operation: ${operation.id}`);
    }
  }
  if (report.apply) {
    const counts = report.apply.results.reduce<Record<string, number>>((acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {});
    for (const [status, count] of Object.entries(counts).sort()) {
      lines.push(`[adopt-ts-apply] ${status}: ${count}`);
    }
    for (const result of report.apply.results.filter((entry) => entry.status === "failed")) {
      lines.push(`[adopt-ts-apply] failed operation: ${result.id}${result.error ? ` - ${result.error}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderExperimentalTsApply(report: ExperimentalTsApplyReport, json = false): string {
  return json ? `${JSON.stringify(report, null, 2)}\n` : renderExperimentalTsApplyText(report);
}

export function runExperimentalTsApply(opts: RunAdoptionPlanOptions): RunExperimentalTsApplyResult {
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const targetError = validateRepoAdoptionTarget(repoRoot, opts.explicitRepo === true, opts.env);
  if (targetError) {
    const result = {
      exitCode: 2,
      repoRoot,
      steps: [targetError],
      lines: [`[init] failed: ${targetError.step}${targetError.detail ? ` - ${targetError.detail}` : ""}`],
    };
    return {
      exitCode: 2,
      output: opts.json === true ? `${JSON.stringify(result, null, 2)}\n` : `${result.lines.join("\n")}\n`,
    };
  }

  const plan = planAdoption({
    repoRoot,
    mode: opts.mode,
    apply: true,
  });
  const unsupportedOperations = unsupportedSafeApplicatorOperations(plan);
  if (unsupportedOperations.length > 0) {
    const report: ExperimentalTsApplyReport = {
      protocol: 1,
      command: "adopt",
      experimentalTsApply: true,
      repoRoot,
      mode: opts.mode,
      ok: false,
      plan: renderAdoptionPlanObject(plan),
      unsupportedOperations: unsupportedOperations.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        path: operation.path,
        reason: operation.reason,
      })),
    };
    return { exitCode: 1, output: renderExperimentalTsApply(report, opts.json === true) };
  }

  const apply = applyAdoptionPlan(plan);
  const report: ExperimentalTsApplyReport = {
    protocol: 1,
    command: "adopt",
    experimentalTsApply: true,
    repoRoot,
    mode: opts.mode,
    ok: apply.ok,
    plan: renderAdoptionPlanObject(plan),
    apply,
  };
  return {
    exitCode: apply.ok ? 0 : 1,
    output: renderExperimentalTsApply(report, opts.json === true),
  };
}
