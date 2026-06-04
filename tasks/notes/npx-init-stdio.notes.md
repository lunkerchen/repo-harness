# npx init stdio Notes

## Context

`repo-harness init` delegates to `scripts/setup-plugins.sh` for global Claude
plugin and hook-profile bootstrap. The CLI wrapper used `spawnSync` with
captured stdout/stderr, so users running `npx -y repo-harness init` saw a blank
terminal until the whole setup script exited.

## Decision

- Keep `runGlobalRuntimeSetup` defaulting to captured `pipe` stdio so tests and
  programmatic callers can continue to inspect `stdout` and `stderr`.
- Pass `stdio: "inherit"` from the public `repo-harness init` CLI action so the
  setup script streams progress directly to the user's terminal.
- Stop installing the Superpowers Claude marketplace plugin by default. The
  existing script had encoded it as a default even when the user did not request
  it; the CLI now forwards it only when `--with-superpowers` is explicit.

## Verification

- `bun test tests/cli/global-runtime-init.test.ts`
- `bun src/cli/index.ts init --help`
- `bun src/cli/index.ts update --help`
- `HOME="$(mktemp -d)" bun src/cli/index.ts init` streamed the banner and clone
  progress immediately, then completed successfully against the temporary home.
