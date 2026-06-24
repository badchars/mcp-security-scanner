# Contributing to mcp-security-scanner

Thank you for your interest in contributing to mcp-security-scanner! This document provides guidelines and instructions to help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/badchars/mcp-security-scanner.git
cd mcp-security-scanner

# Install dependencies (Bun 1.3.9+ required)
bun install

# Build the project
bun run build

# Start in development mode (watch for changes)
bun run dev
```

## Project Structure

```
src/
├── index.ts                # Entry point, CLI flags, MCP server bootstrap
├── protocol/
│   └── tools.ts            # Tool registry — all 43 tools registered here
├── types/
│   └── index.ts            # ToolDef, ToolContext, ToolResult, Finding interfaces
├── utils/
│   ├── hash.ts             # SHA-256 tool definition pinning
│   ├── patterns.ts         # Shared detection patterns (secrets, injections, etc.)
│   └── sarif.ts            # SARIF 2.1.0 builder
├── runtime/                # Runtime Inspection (11 tools)
│   ├── index.ts            #   Tool poisoning, ANSI injection, Unicode stego,
│   ├── poisoning.ts        #   scope creep, shadowing, cross-origin refs,
│   ├── injection.ts        #   definition pinning, rug pull, auth, resource exposure
│   ├── steganography.ts
│   ├── scope.ts
│   ├── shadowing.ts
│   ├── pinning.ts
│   └── auth.ts
├── static/                 # Static Analysis (12 tools)
│   ├── index.ts            #   Command injection, SSRF, path traversal,
│   ├── command-injection.ts #  code execution, hardcoded secrets, missing logging,
│   ├── ssrf.ts             #   insecure crypto, prototype pollution, ReDoS,
│   ├── path-traversal.ts   #   unsafe regex, information disclosure
│   ├── code-execution.ts
│   ├── secrets.ts
│   ├── logging.ts
│   ├── crypto.ts
│   ├── prototype-pollution.ts
│   ├── redos.ts
│   ├── unsafe-regex.ts
│   └── info-disclosure.ts
├── config/                 # Config Audit (7 tools)
│   ├── index.ts            #   Auto-discovery, deep config audit, .env scanning,
│   ├── discovery.ts        #   transport security, context oversharing,
│   ├── audit.ts            #   file permissions
│   ├── env.ts
│   ├── transport.ts
│   ├── oversharing.ts
│   └── permissions.ts
├── deps/                   # Dependency Analysis (7 tools)
│   ├── index.ts            #   Lockfile parsing, typosquatting, unpinned versions,
│   ├── lockfile.ts         #   install scripts, SDK version, deprecated packages,
│   ├── typosquat.ts        #   license compliance
│   ├── versions.ts
│   ├── scripts.ts
│   ├── sdk.ts
│   ├── deprecated.ts
│   └── license.ts
├── report/                 # Report & Compliance (4 tools)
│   ├── index.ts            #   JSON, Markdown, SARIF reports,
│   ├── json.ts             #   full audit orchestrator, report diff
│   ├── markdown.ts
│   ├── sarif.ts
│   ├── orchestrator.ts
│   └── diff.ts
└── meta/                   # Meta (2 tools)
    ├── index.ts            #   Check listing with OWASP mapping,
    ├── checks.ts           #   OWASP MCP Top 10 reference
    └── owasp.ts
```

## Adding a New Security Check (Analyzer)

Each security check is defined using the `ToolDef` interface. Every check has a name, description, a Zod input schema, and an async `execute` function that returns findings.

### 1. Define the check

Create or edit a file in the appropriate category directory:

```typescript
import { z } from "zod";
import type { ToolDef, ToolContext } from "../types/index.js";
import { json, text } from "../types/index.js";

export const myNewCheck: ToolDef = {
  name: "my_new_check",
  description: "Short description of what the check detects",
  schema: {
    projectPath: z.string().describe("Absolute path to the MCP server project"),
    severity: z
      .enum(["critical", "high", "medium", "low", "info"])
      .optional()
      .default("medium")
      .describe("Minimum severity to report"),
  },
  execute: async (args, ctx) => {
    const { projectPath, severity } = args as {
      projectPath: string;
      severity: string;
    };

    const findings: Finding[] = [];

    // ... perform analysis ...

    return json({
      check: "my_new_check",
      findings,
      summary: { total: findings.length },
    });
  },
};
```

### 2. Register the check

Import and add the check to the `allTools` array in `src/protocol/tools.ts`:

```typescript
import { myNewCheck } from "../static/index.js";

// Add to the allTools array
export const allTools: ToolDef[] = [
  // ... existing tools
  myNewCheck,
];
```

### 3. Map to OWASP MCP Top 10

Every check should map to one or more OWASP MCP Top 10 categories. Update the check metadata with the appropriate mapping:

- MCP-01: Tool Poisoning via Prompt Injection
- MCP-02: Excessive Permission Scope
- MCP-03: Tool Shadowing
- MCP-04: Rug Pull via Tool Redefinition
- MCP-05: Server Spoofing
- MCP-06: Implicit Trust Across Tools
- MCP-07: Indirect Prompt Injection
- MCP-08: Resource Exhaustion
- MCP-09: Sensitive Data Exfiltration
- MCP-10: Insufficient Logging & Monitoring

### 4. Test the check

```bash
bun run src/index.ts --tool my_new_check '{"projectPath": "/path/to/mcp-server"}'
```

## Guidelines

- **TypeScript strict mode** -- the project uses strict compiler settings. Fix all type errors before submitting.
- **Zod schemas** -- every tool input field must use Zod for validation with a `.describe()` call explaining the field.
- **100% local execution** -- this scanner makes zero external API calls. All analysis is performed locally. Do not add network calls.
- **ts-morph for AST analysis** -- use `ts-morph` for all static analysis checks. Do not use regex-only approaches for code analysis when AST is more appropriate.
- **Minimal dependencies** -- avoid adding new dependencies unless strictly necessary.
- **Conventional Commits** -- use the [Conventional Commits](https://www.conventionalcommits.org/) format for all commit messages:
  - `feat:` for new features or checks
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `refactor:` for code refactoring
  - `chore:` for build/tooling changes
- **ESM imports** -- always use `.js` extensions in import paths (TypeScript ESM requirement).
- **No console.log in tool output** -- tool results go through the `text()` or `json()` helpers only.
- **Structured findings** -- every check should return findings in the standardized `Finding` format with severity, OWASP mapping, description, and remediation.

## Submitting a Pull Request

1. Fork the repository and create a feature branch from `main`.
2. Make your changes following the guidelines above.
3. Ensure the project builds cleanly: `bun run build`
4. Test your changes with the CLI: `bun run src/index.ts --tool <tool_name> '<json_args>'`
5. Commit using Conventional Commits format.
6. Open a pull request against `main` with a clear description of what you changed and why.

## Reporting Issues

- Use [GitHub Issues](https://github.com/badchars/mcp-security-scanner/issues) for bug reports and feature requests.
- For security vulnerabilities, see [SECURITY.md](SECURITY.md) -- do **not** open a public issue.
- Include reproduction steps, expected behavior, and your environment details (OS, Bun/Node version).
