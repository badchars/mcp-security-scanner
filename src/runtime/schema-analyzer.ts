import type { Finding } from "../types/findings.js";
import type { ServerTool } from "./client.js";

const COMMON_TOOL_NAMES = new Set([
  // File operations (Claude Code, filesystem servers)
  "read_file", "write_file", "edit_file", "list_directory", "create_directory",
  "move_file", "search_files", "get_file_info", "read_multiple_files",
  // Shell / execution
  "bash", "execute_command", "run_command", "shell", "terminal",
  "run_script", "exec", "execute",
  // Search
  "search", "grep", "find", "glob", "ripgrep",
  // Web
  "fetch", "web_search", "browse", "http_request", "curl",
  // Git
  "git", "git_status", "git_diff", "git_log", "git_commit",
  // Database
  "query", "sql", "execute_query", "read_query",
  // Memory / knowledge
  "remember", "recall", "store", "retrieve",
]);

const DANGEROUS_PARAM_PATTERNS = [
  { pattern: /^(command|cmd|shell|exec|script)$/i, severity: "critical" as const, desc: "Shell command parameter" },
  { pattern: /^(path|file|filepath|file_path|filename|directory|dir|folder)$/i, severity: "high" as const, desc: "Unrestricted file path" },
  { pattern: /^(url|uri|endpoint|href|link|target)$/i, severity: "high" as const, desc: "Unrestricted URL parameter" },
  { pattern: /^(query|sql|expression|filter|regex|pattern|code)$/i, severity: "medium" as const, desc: "Query/code injection surface" },
  { pattern: /^(glob|wildcard)$/i, severity: "medium" as const, desc: "Wildcard pattern parameter" },
];

export function analyzeScope(tools: ServerTool[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;

  // Check excessive tool count
  if (tools.length > 50) {
    findings.push({
      id: `RT-SCOPE-${String(counter++).padStart(3, "0")}`,
      title: "Excessive Tool Count",
      severity: "medium",
      owasp_mcp: "MCP02",
      owasp_mcp_title: "Tool & Scope Mismanagement",
      category: "runtime",
      evidence: `Server exposes ${tools.length} tools (threshold: 50). High tool count increases attack surface and prompt complexity.`,
      remediation: "Reduce tool count. Split into multiple focused servers. Remove unused or redundant tools.",
      cwe: "CWE-250",
    });
  }

  for (const tool of tools) {
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== "object") continue;

    const properties = (schema as any).properties;
    if (!properties || typeof properties !== "object") continue;

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      const ps = paramSchema as any;

      // Check for any/object type without constraints
      if (ps.type === "object" && !ps.properties) {
        findings.push({
          id: `RT-SCOPE-${String(counter++).padStart(3, "0")}`,
          title: `Over-permissive Parameter: ${tool.name}.${paramName}`,
          severity: "medium",
          owasp_mcp: "MCP02",
          owasp_mcp_title: "Tool & Scope Mismanagement",
          category: "runtime",
          evidence: `Tool "${tool.name}" parameter "${paramName}" accepts arbitrary object without property constraints`,
          remediation: "Define explicit properties and types for object parameters. Use Zod schemas with strict validation.",
          cwe: "CWE-732",
        });
      }

      // Check dangerous parameter names
      for (const dp of DANGEROUS_PARAM_PATTERNS) {
        if (dp.pattern.test(paramName)) {
          // Only flag if there's no enum constraint
          if (!ps.enum && !ps.const) {
            findings.push({
              id: `RT-SCOPE-${String(counter++).padStart(3, "0")}`,
              title: `Dangerous Parameter: ${tool.name}.${paramName}`,
              severity: dp.severity,
              owasp_mcp: "MCP02",
              owasp_mcp_title: "Tool & Scope Mismanagement",
              category: "runtime",
              evidence: `Tool "${tool.name}" has ${dp.desc} "${paramName}" without enum/allowlist constraint`,
              remediation: "Add enum constraints, allowlists, or strict validation for sensitive parameters.",
              cwe: "CWE-732",
            });
          }
          break;
        }
      }
    }
  }

  return findings;
}

export function analyzeToolShadowing(tools: ServerTool[], knownTools?: string[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;
  const knownSet = new Set(knownTools ?? COMMON_TOOL_NAMES);

  for (const tool of tools) {
    if (knownSet.has(tool.name)) {
      findings.push({
        id: `RT-SHADOW-${String(counter++).padStart(3, "0")}`,
        title: `Tool Name Shadows Common Tool: "${tool.name}"`,
        severity: "high",
        owasp_mcp: "MCP06",
        owasp_mcp_title: "Context & Tool Shadowing",
        category: "runtime",
        evidence: `Tool "${tool.name}" matches a common MCP tool name from well-known servers. A rogue server registering this name could intercept calls intended for a legitimate server.`,
        remediation: "Use namespaced tool names (e.g. prefix with server name). Audit tool name collisions across configured servers.",
        cwe: "CWE-346",
        references: ["https://blog.trailofbits.com/2025/04/22/mcp-security-research/"],
      });
    }
  }

  return findings;
}

export function analyzeCrossOrigin(tools: ServerTool[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;

  const crossOriginPatterns = [
    /when\s+using\s+(?:the\s+)?(\w+)\s+tool/i,
    /before\s+calling\s+(?:the\s+)?(\w+)/i,
    /after\s+calling\s+(?:the\s+)?(\w+)/i,
    /always\s+.*?with\s+(?:the\s+)?(\w+)\s+tool/i,
    /use\s+(?:the\s+)?(\w+)\s+tool\s+(?:to|for)/i,
    /tell\s+(?:the\s+)?(\w+)\s+server/i,
    /pass\s+(?:to|this\s+to)\s+(?:the\s+)?(\w+)/i,
  ];

  for (const tool of tools) {
    const desc = tool.description ?? "";

    for (const pattern of crossOriginPatterns) {
      const match = desc.match(pattern);
      if (match) {
        findings.push({
          id: `RT-XORIGIN-${String(counter++).padStart(3, "0")}`,
          title: `Cross-Origin Tool Reference in "${tool.name}"`,
          severity: "high",
          owasp_mcp: "MCP06",
          owasp_mcp_title: "Context & Tool Shadowing",
          category: "runtime",
          evidence: `Tool "${tool.name}" description references external tool/server: "${match[0]}"`,
          remediation: "Remove cross-origin references from tool descriptions. Each server should only describe its own tools.",
          cwe: "CWE-346",
        });
        break;
      }
    }
  }

  return findings;
}

export function analyzeResourceExposure(
  resources: { uri: string; name?: string; description?: string }[],
  prompts: { name: string; description?: string }[],
): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;

  const sensitivePathPatterns = [
    /\/etc\//i,
    /~\/\.ssh/i,
    /\.env/i,
    /\.aws/i,
    /\.kube/i,
    /credentials/i,
    /\.gnupg/i,
    /id_rsa/i,
    /private.?key/i,
  ];

  const broadUriPatterns = [
    /^file:\/\/\*$/,
    /^file:\/\/\//,
    /^https?:\/\/\*$/,
    /\*\*$/,
  ];

  for (const resource of resources) {
    // Check broad URI patterns
    for (const pattern of broadUriPatterns) {
      if (pattern.test(resource.uri)) {
        findings.push({
          id: `RT-RESOURCE-${String(counter++).padStart(3, "0")}`,
          title: `Overly Broad Resource URI: ${resource.uri}`,
          severity: "high",
          owasp_mcp: "MCP10",
          owasp_mcp_title: "Context Over-sharing & Data Exposure",
          category: "runtime",
          evidence: `Resource "${resource.name ?? resource.uri}" has broad URI pattern "${resource.uri}" allowing wide file/network access`,
          remediation: "Restrict resource URI patterns to specific directories or endpoints. Avoid wildcards.",
          cwe: "CWE-200",
        });
        break;
      }
    }

    // Check sensitive paths
    for (const pattern of sensitivePathPatterns) {
      if (pattern.test(resource.uri)) {
        findings.push({
          id: `RT-RESOURCE-${String(counter++).padStart(3, "0")}`,
          title: `Resource Exposes Sensitive Path: ${resource.uri}`,
          severity: "critical",
          owasp_mcp: "MCP10",
          owasp_mcp_title: "Context Over-sharing & Data Exposure",
          category: "runtime",
          evidence: `Resource "${resource.name ?? resource.uri}" exposes sensitive path: ${resource.uri}`,
          remediation: "Remove access to sensitive paths. Use allowlists for permitted resource URIs.",
          cwe: "CWE-200",
        });
        break;
      }
    }
  }

  return findings;
}
