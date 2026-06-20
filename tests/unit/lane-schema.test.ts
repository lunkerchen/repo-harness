import { describe, expect, test } from "bun:test";
import { validateLaneContract } from "../../src/core/lanes/schema";

describe("lane contract schema", () => {
  test("accepts a minimal valid lane contract", () => {
    const report = validateLaneContract({
      schema_version: 1,
      run_id: "auth-refresh-20260620",
      limits: { max_writable_lanes: 2 },
      lanes: [
        {
          id: "worker-api",
          role: "worker",
          write_scopes: ["src/auth/", "tests/auth/"],
          forbidden_scopes: ["AGENTS.md", ".ai/hooks/"],
          required_evidence: ["files_changed", "commands_run", "head_sha"],
        },
        {
          id: "reviewer-api",
          role: "reviewer",
          depends_on: ["worker-api"],
          write_scopes: [],
          required_evidence: ["findings", "reviewed_head_sha"],
        },
      ],
    });

    expect(report.status).toBe("ok");
    expect(report.contract?.lanes).toHaveLength(2);
  });

  test("rejects reviewer write scopes and unknown dependencies", () => {
    const report = validateLaneContract({
      schema_version: 1,
      run_id: "run-1",
      lanes: [
        { id: "reviewer", role: "reviewer", depends_on: ["missing"], write_scopes: ["src/"] },
      ],
    });

    expect(report.status).toBe("fail");
    expect(report.issues.map((issue) => issue.code)).toContain("reviewer-write-scope");
    expect(report.issues.map((issue) => issue.code)).toContain("unknown-dependency");
  });

  test("rejects duplicate lane ids, duplicate write scopes, and glob scopes", () => {
    const report = validateLaneContract({
      schema_version: 1,
      run_id: "run-1",
      lanes: [
        { id: "worker", role: "worker", write_scopes: ["src/*"] },
        { id: "worker", role: "worker", write_scopes: ["src/"] },
        { id: "worker-two", role: "worker", write_scopes: ["src/"] },
      ],
    });

    expect(report.status).toBe("fail");
    expect(report.issues.map((issue) => issue.code)).toContain("duplicate-lane-id");
    expect(report.issues.map((issue) => issue.code)).toContain("invalid-scope");
    expect(report.issues.map((issue) => issue.code)).toContain("duplicate-write-scope");
  });

  test("enforces max_writable_lanes", () => {
    const report = validateLaneContract({
      schema_version: 1,
      run_id: "run-1",
      limits: { max_writable_lanes: 1 },
      lanes: [
        { id: "worker-a", role: "worker", write_scopes: ["src/a"] },
        { id: "worker-b", role: "worker", write_scopes: ["src/b"] },
      ],
    });

    expect(report.status).toBe("fail");
    expect(report.issues.map((issue) => issue.code)).toContain("max-writable-lanes-exceeded");
  });
});
