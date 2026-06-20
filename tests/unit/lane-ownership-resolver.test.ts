import { describe, expect, test } from "bun:test";
import { laneForbiddenScopes, resolveLaneWriteOwner } from "../../src/core/lanes/ownership-resolver";
import type { LaneContract } from "../../src/core/lanes/schema";

const contract: LaneContract = {
  schema_version: 1,
  run_id: "run-1",
  lanes: [
    { id: "worker-root", role: "worker", write_scopes: ["src"], forbidden_scopes: [".ai/hooks"] },
    { id: "worker-auth", role: "worker", write_scopes: ["src/auth"] },
    { id: "reviewer", role: "reviewer", write_scopes: [] },
  ],
};

describe("lane ownership resolver", () => {
  test("chooses the most specific matching write scope", () => {
    expect(resolveLaneWriteOwner(contract, "src/auth/session.ts").owner?.lane.id).toBe("worker-auth");
    expect(resolveLaneWriteOwner(contract, "src/ui/button.ts").owner?.lane.id).toBe("worker-root");
  });

  test("reports unassigned and invalid paths", () => {
    expect(resolveLaneWriteOwner(contract, "docs/spec.md").status).toBe("unassigned");
    expect(resolveLaneWriteOwner(contract, "../escape.ts").status).toBe("invalid-target");
  });

  test("reports equal-specificity ambiguity", () => {
    const ambiguous: LaneContract = {
      schema_version: 1,
      run_id: "run-1",
      lanes: [
        { id: "worker-a", role: "worker", write_scopes: ["src/auth"] },
        { id: "worker-b", role: "worker", write_scopes: ["src/auth"] },
      ],
    };

    const result = resolveLaneWriteOwner(ambiguous, "src/auth/session.ts");
    expect(result.status).toBe("ambiguous");
    expect(result.candidates.map((candidate) => candidate.lane.id).sort()).toEqual(["worker-a", "worker-b"]);
  });

  test("matches forbidden scopes on a lane", () => {
    expect(laneForbiddenScopes(contract.lanes[0], ".ai/hooks/pre-edit-guard.sh")).toEqual([".ai/hooks"]);
    expect(laneForbiddenScopes(contract.lanes[1], "src/auth/session.ts")).toEqual([]);
  });
});
