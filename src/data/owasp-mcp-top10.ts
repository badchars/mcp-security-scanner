import type { OwaspMcpId } from "../types/findings.js";

export interface OwaspCategory {
  id: OwaspMcpId;
  title: string;
  description: string;
  remediation: string;
  cwe: string[];
  references: string[];
}

export const OWASP_MCP_TOP10: OwaspCategory[] = [
  {
    id: "MCP01",
    title: "Excessive Privilege & Token Mismanagement",
    description:
      "MCP clients or servers operate with broader permissions than necessary. API keys, tokens, or credentials are stored insecurely, shared across unrelated services, or transmitted without adequate protection.",
    remediation:
      "Apply least privilege. Store secrets in environment variables, not config files. Rotate tokens regularly. Never embed API keys in CLI arguments.",
    cwe: ["CWE-269", "CWE-522"],
    references: [
      "https://owasp.org/www-project-mcp-top-10/",
      "https://www.nsa.gov/Press-Room/News-Highlights/Article/Article/4132057/",
    ],
  },
  {
    id: "MCP02",
    title: "Tool & Scope Mismanagement",
    description:
      "MCP servers expose too many tools, tools with overly broad capabilities, or accept arbitrary input types (any, unrestricted file paths, shell commands). Excessive tool count increases attack surface.",
    remediation:
      "Minimize exposed tools. Use strict Zod schemas with allowlists. Limit parameter types. Avoid wildcard patterns in schemas.",
    cwe: ["CWE-250", "CWE-732"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
  {
    id: "MCP03",
    title: "Tool Poisoning via Description Injection",
    description:
      "Malicious or compromised MCP servers embed hidden instructions in tool descriptions that manipulate LLM behavior. Includes prompt injection, ANSI escape sequences, zero-width Unicode characters, and social engineering patterns.",
    remediation:
      "Pin tool definitions and verify hashes. Review all tool descriptions manually. Strip control characters. Monitor for description changes.",
    cwe: ["CWE-94", "CWE-116"],
    references: [
      "https://owasp.org/www-project-mcp-top-10/",
      "https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks",
    ],
  },
  {
    id: "MCP04",
    title: "Supply Chain & Dependency Vulnerabilities",
    description:
      "MCP servers depend on vulnerable packages, typosquatted dependencies, or packages with malicious install scripts. Unpinned versions allow silent updates.",
    remediation:
      "Pin exact versions in lockfiles. Audit install scripts. Check for typosquatting. Monitor advisories. Use npm audit / OSV.",
    cwe: ["CWE-1357", "CWE-829"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
  {
    id: "MCP05",
    title: "Command Injection & Code Execution",
    description:
      "MCP tool handlers pass user-controlled input to dangerous sinks: child_process.exec, eval, new Function, vm.runInNewContext, fs operations with unsanitized paths, fetch with user-controlled URLs (SSRF).",
    remediation:
      "Never pass user input to exec/eval. Use execFile with argument arrays. Validate and sanitize all paths against a base directory. Allowlist URLs.",
    cwe: ["CWE-78", "CWE-94", "CWE-22", "CWE-918"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
  {
    id: "MCP06",
    title: "Context & Tool Shadowing",
    description:
      "One MCP server's tool descriptions reference tools from other servers, enabling cross-origin manipulation. Rogue servers register tools with names that shadow legitimate tools (e.g. read_file, bash).",
    remediation:
      "Namespace all tools. Monitor for tool name collisions across servers. Flag cross-origin references in descriptions.",
    cwe: ["CWE-346"],
    references: [
      "https://owasp.org/www-project-mcp-top-10/",
      "https://blog.trailofbits.com/2025/04/22/mcp-security-research/",
    ],
  },
  {
    id: "MCP07",
    title: "Insufficient Authentication & Transport Security",
    description:
      "MCP servers accept unauthenticated connections, use HTTP instead of HTTPS for remote transport, or expose SSE/WebSocket endpoints without TLS.",
    remediation:
      "Require authentication for all remote servers. Use HTTPS/WSS exclusively. Validate OAuth tokens. Bind to localhost for local servers.",
    cwe: ["CWE-287", "CWE-319"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
  {
    id: "MCP08",
    title: "Insufficient Logging & Error Handling",
    description:
      "Tool handlers lack error handling, swallow exceptions silently, expose stack traces in responses, or have no audit logging of tool invocations.",
    remediation:
      "Wrap all tool handlers in try-catch. Log tool invocations with timestamps. Never expose err.stack or err.message to clients. Implement rate limiting.",
    cwe: ["CWE-778", "CWE-209"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
  {
    id: "MCP09",
    title: "Shadow Servers & Unauthorized MCP Endpoints",
    description:
      "Unknown or unverified MCP servers in configuration files. Servers using npx -y to auto-install unverified packages. Servers pointing to binaries in writable directories (/tmp).",
    remediation:
      "Audit all configured servers. Verify npm package names. Avoid npx -y for unknown packages. Only use servers from trusted sources.",
    cwe: ["CWE-829", "CWE-494"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
  {
    id: "MCP10",
    title: "Context Over-sharing & Data Exposure",
    description:
      "MCP clients share excessive context with servers: all environment variables, sensitive file paths, broad resource access patterns. Servers expose resources with overly permissive URI patterns.",
    remediation:
      "Explicitly list env vars per server. Restrict resource URI patterns. Minimize data shared with each server. Apply data minimization principles.",
    cwe: ["CWE-200", "CWE-532"],
    references: ["https://owasp.org/www-project-mcp-top-10/"],
  },
];

export function getOwaspCategory(id: OwaspMcpId): OwaspCategory {
  return OWASP_MCP_TOP10.find((c) => c.id === id)!;
}
