# mcp-security-scanner — MCP Security Scanner

## Overview
43-tool MCP server + CLI for scanning MCP servers and their source code for security vulnerabilities.
Runtime inspection, AST-based static analysis, config audit, dependency analysis.
OWASP MCP Top 10 compliance mapping. 100% local, zero external API calls.

## Architecture
- **Runtime:** Bun 1.3.9+ (dev), Node.js (publish)
- **Dependencies:** @modelcontextprotocol/sdk, ts-morph, zod (3 runtime deps only)
- **Transport:** stdio only
- **Pattern:** Each category in own directory under src/, tools registered in src/protocol/tools.ts

## Key Rules
- TypeScript strict mode, English code/comments
- Every tool schema field must have `.describe()`
- Import paths use `.js` extension (ESM)
- Zero external API calls — all analysis runs locally
- Finding IDs follow pattern: CATEGORY-CHECK-NNN (e.g. SAST-CMD-001, RT-POISON-003)

## Tool Categories (43 tools)
- `rt_` — Runtime Inspection (11 tools): connect to live MCP servers, inspect capabilities
- `sast_` — Static Analysis (12 tools): AST-based code scanning via ts-morph
- `cfg_` — Config Audit (7 tools): parse and audit MCP client configs
- `dep_` — Dependency Analysis (7 tools): lockfile parsing, typosquat detection
- `report_` — Reports (4 tools): markdown, SARIF, JSON, full audit orchestrator
- `scanner_` — Meta (2 tools): check listing, OWASP mapping

## Commands
```bash
bun install                          # Install deps
bun run dev                          # Dev mode (watch)
bun run build                        # Build for npm
bun run src/index.ts --help          # CLI help
bun run src/index.ts --list          # List all tools
bun run src/index.ts --tool <name> '<json>'  # Run single tool
bun run src/index.ts --full-audit ./path     # Full security audit
```
