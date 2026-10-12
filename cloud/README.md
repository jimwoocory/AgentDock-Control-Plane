# AgentDock Control Plane — private cloud P0

This independent Sites Worker receives bounded read-only snapshots from a separate collector on company PC-20251130TKZA. It never calls an AgentDock mutation or executes agent work. It exposes a private dashboard and read-only MCP at `/mcp`.

`npm install`, `npm test`, `npm run build`. Sites identity stays in `.openai/hosting.json`; migrations are schema-only Drizzle files. Runtime secrets and bridge configuration never enter Git. See docs/status.md for the current Gate.
