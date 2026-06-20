#!/usr/bin/env bun
/**
 * Minimal hook-only CLI entrypoint for host adapters.
 *
 * Host hooks run after almost every tool call and may be invoked concurrently.
 * Keep this file self-contained so the hot hook path does not cold-load the
 * full commander CLI or non-hook command modules.
 */

import { runHook as runHookRuntime, type RunHookOptions, type RunHookResult } from './hook/runtime';
import { runPromptGuardDecideCli } from './commands/prompt-guard-decision';
import { runStateSnapshotCli } from './hook/state-snapshot';
import { runLaneEditDecisionCli, runLaneRecordEditCli, runLaneStopDecisionCli } from './hook/lane-decision';
import {
  runSubagentPreToolCli,
  runSubagentStartContextCli,
  runSubagentStopQualityCli,
} from './hook/subagent-lane';
import type { HookEvent, RouteId } from './hook/route-registry';

export type RunHookEntryOptions = RunHookOptions;
export type RunHookEntryResult = RunHookResult;

export function runHookEntry(opts: RunHookEntryOptions): RunHookEntryResult {
  return runHookRuntime({ ...opts, commandName: 'repo-harness-hook' });
}

function parseCliArgs(argv: readonly string[]): { event: HookEvent; routeId: RouteId } | null {
  const event = argv[0] as HookEvent | undefined;
  const routeFlagIndex = argv.indexOf('--route');
  const routeId = routeFlagIndex >= 0 ? argv[routeFlagIndex + 1] : undefined;
  if (!event || !routeId) return null;
  return { event, routeId: routeId as RouteId };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'prompt-guard-decide') {
    console.log(runPromptGuardDecideCli());
    process.exit(0);
  }

  if (argv[0] === 'state-snapshot') {
    const result = runStateSnapshotCli(argv.slice(1));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'lane-edit-decision') {
    const result = runLaneEditDecisionCli(argv.slice(1));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'lane-record-edit') {
    const result = runLaneRecordEditCli(argv.slice(1));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'lane-stop-decision') {
    const result = runLaneStopDecisionCli();
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'subagent-pretool-decision') {
    const result = runSubagentPreToolCli(await Bun.stdin.text());
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'subagent-start-context') {
    const result = runSubagentStartContextCli(await Bun.stdin.text());
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'subagent-stop-quality') {
    const result = runSubagentStopQualityCli(await Bun.stdin.text());
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  const parsed = parseCliArgs(argv);
  if (!parsed) {
    process.stderr.write('repo-harness-hook: usage: repo-harness-hook <event> --route <route>\n');
    process.exit(2);
  }
  const result = runHookEntry(parsed);
  process.exit(result.exitCode);
}
