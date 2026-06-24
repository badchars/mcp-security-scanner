# Changelog

## [0.1.0] - 2026-06-24

### Added

- Initial release with 43 tools across 6 categories
- **Runtime Inspection** (11 tools) — live MCP server analysis via SDK Client
  - Tool poisoning detection (15+ patterns)
  - ANSI escape injection detection
  - Unicode steganography detection (15 hidden character types)
  - Scope creep analysis
  - Tool shadowing detection
  - Cross-origin reference detection
  - Tool definition pinning (SHA-256) and rug pull verification
  - Authentication checking
  - Resource exposure analysis
- **Static Analysis** (12 tools) — AST-based scanning via ts-morph
  - Command injection (exec, spawn, execSync)
  - SSRF (fetch, axios, http.request)
  - Path traversal (fs operations with user input)
  - Code execution (eval, new Function, vm)
  - Hardcoded secrets (21 regex patterns)
  - Missing logging and error handling
  - Insecure cryptography
  - Prototype pollution
  - Regular expression DoS (ReDoS)
  - Unsafe regex (user input in new RegExp)
  - Information disclosure
- **Config Audit** (7 tools) — MCP config file security
  - Auto-discovery (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf)
  - Deep config audit (secrets in args, npx -y, shadow servers)
  - .env file scanning
  - Transport security verification
  - Context oversharing detection
  - File permission checking
- **Dependency Analysis** (7 tools) — supply chain security
  - Lockfile parsing (package-lock.json v2/v3, bun.lock)
  - Typosquatting detection (Levenshtein, keyboard adjacency, vowel swap)
  - Unpinned version detection
  - Install script detection
  - MCP SDK version checking
  - Deprecated package detection
  - License compliance audit
- **Report & Compliance** (4 tools) — multi-format output
  - JSON structured reports
  - Markdown reports with OWASP compliance matrix
  - SARIF 2.1.0 for GitHub Code Scanning
  - Full audit orchestrator
  - Report comparison (diff between scans)
- **Meta** (2 tools) — scanner info
  - Check listing with OWASP mapping
  - Full OWASP MCP Top 10 reference
- CLI with --list, --help, --tool, --full-audit, --scan-source, --scan-deps, --scan-config, --scan-server, --discover
- OWASP MCP Top 10 compliance mapping for all 43 checks
- 100% local execution, zero external API calls
- README translations in 23 languages
