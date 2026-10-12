# Company readonly bridge

Requires Windows user DPAPI and Node 22.23.2 or newer with built-in `node:sqlite`. Keep this bridge directory outside `.agentdock` and `.codex`. Run it as the same Windows user who encrypted its configuration.

Pass one JSON object to `node configure.mjs` through stdin, never a command argument or a plaintext file. Fields: `siteUrl` (private HTTPS `*.chatgpt.site` origin), `sourceHome` (company user profile containing `.agentdock` and `.codex`), `sourceKey: "company:PC-20251130TKZA"`, `machine: "PC-20251130TKZA"`, `collectorKey`, and `siteToken`. Configuration output reports only success. Own `.data/config.json` contains nonsecret settings and DPAPI ciphertext.

`node collector.mjs --once` captures, uploads and reports counts; HTTP failure gives exit code 1. `--summary` only reads source and prints counts, capability state and SHA-256 task file fingerprints. Neither mode prints task content or credentials. All commands accept `--data-dir <absolute-own-directory>` for a separate installation or controlled fixture. `--snapshot` explicitly prints the safe task projection and is intended only for synthetic fixture inspection; do not use it for real source logs.

Run `powershell.exe -NoProfile -File start.ps1` to start the hidden background collector. `stop.ps1` checks PID, exact start time, executable, collector path and data directory before stopping its owned process. Logs contain counts/states only; `.data/status.json` also contains file hash proofs. Capture timestamps are collector observations, never Agent heartbeat. Cycle requests time out after 20 seconds and the collector waits 20 seconds after each completed attempt.

Task reads are all-or-nothing: malformed, oversized, linked or changing source files make `taskReadOK:false` and `tasks:[]`. The service retains the previous tasks in that case. Source fields are projected through fixed nested whitelists and bounded counts/text. Codex only uses the readonly SQLite thread index and ≤1 MiB lifecycle log tails. Absent, old, inaccessible or unsupported lifecycle evidence is Unknown or explicitly unavailable. Claude has no available source on the configured company machine.

Runtime credentials, source bodies, SQLite files, bridge logs and status/configuration files must never be added to Git. Root owns installation, credentials and production verification.
