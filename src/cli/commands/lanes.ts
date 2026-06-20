import { existsSync, readFileSync } from 'fs';
import { Command } from 'commander';
import { validateLaneContract, type LaneValidationReport } from '../../core/lanes/schema';
import {
  activateLaneContract,
  bindLaneWorktree,
  closeLane,
  formatLaneStatus,
  laneStatus,
  mergeLaneEvidence,
} from '../../core/lanes/state';

export function formatLaneValidation(report: LaneValidationReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines = [`Lane contract: ${report.status}`];
  for (const issue of report.issues) {
    lines.push(`- [${issue.severity}] ${issue.code} ${issue.path}: ${issue.message}`);
  }
  return lines.join('\n');
}

function readContract(file: string): unknown {
  if (!existsSync(file)) throw new Error(`lane contract not found: ${file}`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function buildLanesCommand(): Command {
  const lanes = new Command('lanes')
    .description('Validate and inspect repo-harness lane contracts');

  lanes
    .command('validate')
    .description('Validate a tasks/contracts/*.lanes.json file')
    .argument('<file>', 'Lane contract JSON file')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((file: string, rawOpts: { json?: boolean }) => {
      try {
        const report = validateLaneContract(readContract(file));
        console.log(formatLaneValidation(report, rawOpts.json === true));
        process.exit(report.status === 'fail' ? 1 : 0);
      } catch (error) {
        const report: LaneValidationReport = {
          schema_version: 1,
          status: 'fail',
          issues: [{
            code: 'read-failed',
            severity: 'error',
            path: file,
            message: (error as Error).message,
          }],
        };
        console.log(formatLaneValidation(report, rawOpts.json === true));
        process.exit(1);
      }
    });

  lanes
    .command('activate')
    .description('Activate a validated lane contract for the current repo')
    .argument('<file>', 'Lane contract JSON file')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((file: string, rawOpts: { json?: boolean }) => {
      try {
        const report = activateLaneContract(file);
        console.log(formatLaneStatus(report, rawOpts.json === true));
        process.exit(report.status === 'invalid' ? 1 : 0);
      } catch (error) {
        const failed = {
          schema_version: 1,
          status: 'invalid',
          repo_root: process.cwd(),
          current_worktree: process.cwd(),
          validation: {
            schema_version: 1,
            status: 'fail',
            issues: [{ code: 'activate-failed', severity: 'error', path: file, message: (error as Error).message }],
          },
        };
        console.log(rawOpts.json === true ? JSON.stringify(failed, null, 2) : `Lane run: invalid\n- ${(error as Error).message}`);
        process.exit(1);
      }
    });

  lanes
    .command('bind')
    .description('Bind a lane id to a git worktree')
    .argument('<lane-id>', 'Lane id from the active contract')
    .option('--worktree <path>', 'Worktree root path; defaults to current repo root')
    .option('--branch <name>', 'Branch name to record with the binding')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((laneId: string, rawOpts: { worktree?: string; branch?: string; json?: boolean }) => {
      try {
        const report = bindLaneWorktree(laneId, {
          worktree: rawOpts.worktree,
          branch: rawOpts.branch,
        });
        console.log(formatLaneStatus(report, rawOpts.json === true));
        process.exit(0);
      } catch (error) {
        const message = (error as Error).message;
        console.log(rawOpts.json === true ? JSON.stringify({ schema_version: 1, status: 'fail', error: message }, null, 2) : `Lane bind failed: ${message}`);
        process.exit(1);
      }
    });

  lanes
    .command('status')
    .description('Show the active lane run, bindings, and touched-file state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { json?: boolean }) => {
      const report = laneStatus();
      console.log(formatLaneStatus(report, rawOpts.json === true));
      process.exit(report.status === 'invalid' ? 1 : 0);
    });

  lanes
    .command('evidence')
    .description('Merge structured evidence into a lane runtime state')
    .argument('<lane-id>', 'Lane id from the active contract')
    .requiredOption('--from <file>', 'JSON evidence object to merge')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((laneId: string, rawOpts: { from: string; json?: boolean }) => {
      try {
        if (!existsSync(rawOpts.from)) throw new Error(`lane evidence not found: ${rawOpts.from}`);
        const evidence = JSON.parse(readFileSync(rawOpts.from, 'utf-8'));
        if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
          throw new Error('lane evidence must be a JSON object');
        }
        const result = mergeLaneEvidence(laneId, evidence as Record<string, unknown>);
        if (rawOpts.json === true) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Lane evidence: ${result.status}`);
          if (result.reason) console.log(`- ${result.reason}`);
          if (result.missing && result.missing.length > 0) console.log(`Missing: ${result.missing.join(', ')}`);
        }
        process.exit(result.status === 'recorded' ? 0 : 1);
      } catch (error) {
        const message = (error as Error).message;
        console.log(rawOpts.json === true ? JSON.stringify({ schema_version: 1, status: 'fail', error: message }, null, 2) : `Lane evidence failed: ${message}`);
        process.exit(1);
      }
    });

  lanes
    .command('close')
    .description('Close a lane and optionally merge structured evidence')
    .argument('<lane-id>', 'Lane id from the active contract')
    .option('--evidence <file>', 'JSON evidence object to merge into the lane runtime state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((laneId: string, rawOpts: { evidence?: string; json?: boolean }) => {
      try {
        const report = closeLane(laneId, { evidenceFile: rawOpts.evidence });
        console.log(formatLaneStatus(report, rawOpts.json === true));
        process.exit(0);
      } catch (error) {
        const message = (error as Error).message;
        console.log(rawOpts.json === true ? JSON.stringify({ schema_version: 1, status: 'fail', error: message }, null, 2) : `Lane close failed: ${message}`);
        process.exit(1);
      }
    });

  return lanes;
}
