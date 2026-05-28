#!/usr/bin/env bun
/**
 * agentic-dev CLI entry — Phase 1B.
 *
 * Wires commander.js to install + hook command bodies. status / doctor /
 * migrate remain stubbed (Phase 1C). Keeps the Phase 1A `SUBCOMMANDS` /
 * `Subcommand` exports importable by Phase 1A tests so the scaffold
 * contract survives the rewrite.
 */

import { Command } from 'commander';
import { runInstall, type InstallTargetSpec } from './commands/install';
import { runHook } from './commands/hook';
import type { Location } from './installer/types';
import type { HookEvent, RouteId } from './hook/route-registry';

export const SUBCOMMANDS = ['install', 'hook', 'status', 'doctor', 'migrate'] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

const VALID_TARGETS: readonly InstallTargetSpec[] = ['codex', 'claude', 'both'];
const VALID_LOCATIONS: readonly Location[] = ['global', 'local'];

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('agentic-dev')
    .description('Repo-local agentic development harness CLI')
    .version('0.0.0-phase1b')
    .exitOverride();

  program
    .command('install')
    .description('Install hook adapters into Codex and/or Claude host config')
    .requiredOption('--target <target>', `Target host: ${VALID_TARGETS.join('|')}`)
    .requiredOption('--location <location>', `Install location: ${VALID_LOCATIONS.join('|')}`)
    .action((rawOpts: { target: string; location: string }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `agentic-dev install: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (!VALID_LOCATIONS.includes(rawOpts.location as Location)) {
        console.error(
          `agentic-dev install: invalid --location "${rawOpts.location}" (expected: ${VALID_LOCATIONS.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runInstall({
        target: rawOpts.target as InstallTargetSpec,
        location: rawOpts.location as Location,
      });
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('hook')
    .description('Dispatch a hook event to opt-in repo .ai/hooks/<script>')
    .argument('<event>', 'Hook event name')
    .requiredOption('--route <route>', 'Route id (default, edit, bash, always)')
    .action((event: string, rawOpts: { route: string }) => {
      const result = runHook({
        event: event as HookEvent,
        routeId: rawOpts.route as RouteId,
      });
      process.exit(result.exitCode);
    });

  for (const stubCmd of ['status', 'doctor', 'migrate'] as const) {
    program
      .command(stubCmd)
      .description(`(Phase 1C stub) ${stubCmd}`)
      .action(() => {
        console.error(`agentic-dev ${stubCmd}: not yet implemented (Phase 1C)`);
        process.exit(2);
      });
  }

  return program;
}

if (import.meta.main) {
  try {
    buildProgram().parse(process.argv);
  } catch (err) {
    const e = err as { exitCode?: number; message?: string };
    if (typeof e.exitCode === 'number') process.exit(e.exitCode);
    if (e.message) console.error(e.message);
    process.exit(1);
  }
}
