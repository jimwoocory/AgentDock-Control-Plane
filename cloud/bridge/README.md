# Company readonly bridge

Requires Windows user DPAPI and Node 22.23.2 or newer with built-in `node:sqlite`. Keep this bridge directory outside `.agentdock` and `.codex`. Run it as the same Windows user who encrypted its configuration.

Pass one JSON object to `node configure.mjs` through stdin, never a command argument or a plaintext file. Fields: `siteUrl` (private HTTPS `*.chatgpt.site` origin), `sourceHome` (company user profile containing `.agentdock` and `.codex`), `sourceKey: "company:PC-20251130TKZA"`, `machine: "PC-20251130TKZA"`, `collectorKey`, and `siteToken`. Configuration output reports only success. Own `.data/config.json` contains nonsecret settings and DPAPI ciphertext.

`node collector.mjs --once` captures, uploads and reports counts; HTTP failure gives exit code 1. `--summary` only reads source and prints counts, capability state and SHA-256 task file fingerprints. Neither mode prints task content or credentials. All commands accept `--data-dir <absolute-own-directory>` for a separate installation or controlled fixture. `--snapshot` explicitly prints the safe task projection and is intended only for synthetic fixture inspection; do not use it for real source logs.

The company production installation uses the approved own Windows Scheduled Task `AgentDock-Control-Plane-Bridge`. Control that installation with `Start-ScheduledTask -TaskName 'AgentDock-Control-Plane-Bridge'` / `Stop-ScheduledTask -TaskName 'AgentDock-Control-Plane-Bridge'`. It runs hidden under the encrypting user and starts at logon. Inspect `.data/status.json` or run `node verify-read.mjs` for count-only production readback.

`start.ps1` and `stop.ps1` manage a separate standalone process, not the installed Scheduled Task. The standalone stop checks PID, exact start time, executable, collector path and data directory. Avoid running both modes. Logs contain counts/states only; `.data/status.json` also contains file hash proofs. Capture timestamps are observations, never Agent heartbeat. Requests time out after20seconds and the collector waits20seconds after each attempt.

Task reads are all-or-nothing: malformed, oversized, linked or changing source files make `taskReadOK:false` and `tasks:[]`. The service retains the previous tasks in that case. Source fields are projected through fixed nested whitelists and bounded counts/text. Codex only uses the readonly SQLite thread index and ≤1 MiB lifecycle log tails. Absent, old, inaccessible or unsupported lifecycle evidence is Unknown or explicitly unavailable. Claude has no available source on the configured company machine.

Runtime credentials, source bodies, SQLite files, bridge logs and status/configuration files must never be added to Git. Root owns installation, credentials and production verification.
