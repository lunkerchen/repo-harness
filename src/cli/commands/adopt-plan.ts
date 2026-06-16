import { resolve } from "path";
import type { AdoptionMode } from "../../core/adoption/modes";
import { planAdoption } from "../../core/adoption/plan";
import { renderAdoptionPlanJson, renderAdoptionPlanText } from "../../core/adoption/render";
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
