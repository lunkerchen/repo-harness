import { Command } from 'commander';
import { formatContextAudit, formatContextStatus, runContextStatus } from '../../core/context-audit/report';
import { runContextAudit } from '../../core/context-audit/static-checks';

export function buildContextCommand(): Command {
  const context = new Command('context')
    .description('Inspect repo agent-context health without running hooks or agents');

  context
    .command('status')
    .description('Read cached context audit and dirty state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { json?: boolean }) => {
      const report = runContextStatus();
      console.log(formatContextStatus(report, rawOpts.json === true));
      process.exit(0);
    });

  context
    .command('audit')
    .description('Run deterministic context checks')
    .option('--static', 'Run only deterministic static checks', true)
    .option('--changed', 'Record audit mode as changed; currently uses the same deterministic checks')
    .option('--write-state', 'Write .ai/harness/context-health/latest.json and reset dirty state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { static?: boolean; changed?: boolean; writeState?: boolean; json?: boolean }) => {
      const report = runContextAudit({
        mode: rawOpts.changed === true ? 'changed' : 'static',
        writeState: rawOpts.writeState === true,
      });
      console.log(formatContextAudit(report, rawOpts.json === true));
      process.exit(report.status === 'fail' ? 1 : 0);
    });

  return context;
}
