# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in mcp-security-scanner, please report it responsibly.

**Email:** [contact@orhanyildirim.us](mailto:contact@orhanyildirim.us)

**Do NOT open a public GitHub issue for security vulnerabilities.**

### What to include

- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue.
- Any relevant logs, screenshots, or proof-of-concept code.

### Response timeline

- You will receive an acknowledgment within **48 hours** of your report.
- We will work with you to understand the issue and determine a fix timeline.
- Once resolved, we will coordinate disclosure with you before publishing any advisory.

## Scope

This security policy covers the **mcp-security-scanner codebase only**. It does not cover:

- Vulnerabilities found in MCP servers that mcp-security-scanner scans (those should be reported to the respective maintainers)
- Vulnerabilities in upstream dependencies such as ts-morph or @modelcontextprotocol/sdk (report those to the respective maintainers)
- Misconfiguration of target MCP servers or their environment variables by end users
- False positives or false negatives in scan results (use GitHub Issues for those)
