import { resolve } from "path";
import type { AdoptionMode } from "../../core/adoption/modes";
import { planAdoption } from "../../core/adoption/plan";
import { renderAdoptionPlanJson, renderAdoptionPlanText } from "../../core/adoption/render";

export interface RunAdoptionPlanOptions {
  readonly repo?: string;
  readonly mode: AdoptionMode;
  readonly json?: boolean;
}

export interface RunAdoptionPlanResult {
  readonly exitCode: number;
  readonly output: string;
}

export function runAdoptionPlan(opts: RunAdoptionPlanOptions): RunAdoptionPlanResult {
  const plan = planAdoption({
    repoRoot: resolve(opts.repo ?? process.cwd()),
    mode: opts.mode,
    apply: false,
  });

  return {
    exitCode: 0,
    output: opts.json === true ? renderAdoptionPlanJson(plan) : renderAdoptionPlanText(plan),
  };
}
