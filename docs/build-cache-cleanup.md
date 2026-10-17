# Local build cache retention

The root `build`, `test`, `typecheck`, and `lint` commands prune the local Turbo
cache after the command finishes, including failures. `dev` and `dev:setup` use
the same build wrapper during bootstrap.

The cache target is 2 GiB, keeping the newest entries first. Entries older than
seven days expire. Archives modified in the last minute are protected from
concurrent cleanup, so the target can temporarily be exceeded. Cleanup removes
only recognized Turbo archive/metadata groups; current application output,
release installers, extracted game assets, source files and dependencies remain.
Desktop packaging is not cached by Turbo, avoiding multi-gigabyte copies of its
`out` directory. Next.js development output is also excluded from build archives.

```sh
pnpm clean:build-cache --dry-run
pnpm clean:build-cache
node --test scripts/build-cache.test.mjs
```

Direct `turbo` invocations bypass the wrapper. Use the root package scripts for
automatic retention. Cleanup errors are reported without hiding the original
build/test exit status. No scheduled job or production deployment is installed.
