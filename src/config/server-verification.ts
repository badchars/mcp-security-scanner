import type { McpServerEntry } from "./mcp-config-parser.js";
import type { Finding } from "../types/findings.js";
import { SECRET_PATTERNS } from "../data/secret-patterns.js";

const SUSPICIOUS_PATHS = ["/tmp", "/var/tmp", "\\temp\\", "\\tmp\\"];
const KNOWN_NPX_PREFIXES = [
  "@modelcontextprotocol/", "darknet-mcp-server", "supply-chain-mcp-server",
  "osint-mcp-server", "cve-mcp-server", "mcp-security-scanner",
  "@anthropic-ai/", "@cloudflare/", "wrangler",
];

export function auditServerEntry(server: McpServerEntry, configPath: string): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  // Check for npx -y (auto-install without confirmation)
  if (server.command === "npx" && server.args?.includes("-y")) {
    const pkgName = server.args.find(a => !a.startsWith("-") && a !== "npx") ?? "unknown";
    const isKnown = KNOWN_NPX_PREFIXES.some(p => pkgName.startsWith(p));

    if (!isKnown) {
      counter++;
      findings.push({
        id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
        title: `npx -y Auto-Install for Unverified Package: ${pkgName}`,
        severity: "high",
        owasp_mcp: "MCP09",
        owasp_mcp_title: "Shadow Servers & Unauthorized MCP Endpoints",
        category: "config",
        file: configPath,
        evidence: `Server "${server.name}": npx -y ${pkgName} — auto-installs without confirmation`,
        remediation: "Install the package explicitly with npm install first, then use the installed binary. Verify the package on npmjs.com before use.",
        cwe: "CWE-829",
      });
    }
  }

  // Check for secrets in args (visible in process list)
  if (server.args) {
    for (const arg of server.args) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.pattern.test(arg)) {
          counter++;
          findings.push({
            id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
            title: `${pattern.name} Exposed in CLI Arguments`,
            severity: "critical",
            owasp_mcp: "MCP01",
            owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
            category: "config",
            file: configPath,
            evidence: `Server "${server.name}": secret in args visible via process list (ps aux)`,
            remediation: "Move secrets from CLI arguments to the env block or use environment variables. CLI args are visible to all users via ps.",
            cwe: "CWE-214",
          });
          break;
        }
      }
    }
  }

  // Check for secrets in env block (acceptable but flag high-value)
  if (server.env) {
    for (const [key, value] of Object.entries(server.env)) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.pattern.test(value)) {
          counter++;
          findings.push({
            id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
            title: `${pattern.name} in Server Environment Config`,
            severity: "medium",
            owasp_mcp: "MCP01",
            owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
            category: "config",
            file: configPath,
            evidence: `Server "${server.name}": ${key}=<${pattern.name}> in env block`,
            remediation: "Consider using a secret manager or encrypted env files instead of plaintext in config files.",
            cwe: "CWE-522",
          });
          break;
        }
      }
    }
  }

  // Check for suspicious binary paths
  if (server.command) {
    for (const suspicious of SUSPICIOUS_PATHS) {
      if (server.command.includes(suspicious)) {
        counter++;
        findings.push({
          id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
          title: `Server Binary in Writable Directory`,
          severity: "high",
          owasp_mcp: "MCP09",
          owasp_mcp_title: "Shadow Servers & Unauthorized MCP Endpoints",
          category: "config",
          file: configPath,
          evidence: `Server "${server.name}": command "${server.command}" is in a world-writable directory`,
          remediation: "Move server binaries to a protected directory. Writable directories allow binary replacement attacks.",
          cwe: "CWE-427",
        });
        break;
      }
    }
  }

  // Check for HTTP URLs (no TLS)
  if (server.url) {
    if (server.url.startsWith("http://")) {
      counter++;
      findings.push({
        id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
        title: "Remote Server Using HTTP (No TLS)",
        severity: "high",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "config",
        file: configPath,
        evidence: `Server "${server.name}": ${server.url} — unencrypted transport`,
        remediation: "Use HTTPS for all remote MCP server connections. HTTP allows eavesdropping and MITM attacks.",
        cwe: "CWE-319",
      });
    }

    // Check for tunnel URLs
    if (/ngrok|localtunnel|serveo|bore\.pub|loca\.lt/.test(server.url)) {
      counter++;
      findings.push({
        id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
        title: "Remote Server Using Tunnel URL",
        severity: "medium",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "config",
        file: configPath,
        evidence: `Server "${server.name}": ${server.url} — tunnel URL that could be hijacked`,
        remediation: "Avoid using tunnel URLs for production MCP servers. Tunnel URLs can be hijacked when they expire.",
        cwe: "CWE-346",
      });
    }

    // Check for missing auth headers on remote servers
    if (!server.headers?.Authorization && !server.headers?.authorization) {
      counter++;
      findings.push({
        id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
        title: "Remote Server Without Authorization Header",
        severity: "medium",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "config",
        file: configPath,
        evidence: `Server "${server.name}": no Authorization header configured for remote server`,
        remediation: "Add an Authorization header with a bearer token or API key for remote MCP servers.",
        cwe: "CWE-287",
      });
    }

    // Check for 0.0.0.0 binding
    if (/0\.0\.0\.0|::/.test(server.url)) {
      counter++;
      findings.push({
        id: `CFG-SRV-${String(counter).padStart(3, "0")}`,
        title: "Server Bound to All Interfaces",
        severity: "high",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "config",
        file: configPath,
        evidence: `Server "${server.name}": bound to 0.0.0.0 — accessible from network`,
        remediation: "Bind to localhost (127.0.0.1) for local-only servers. Use 0.0.0.0 only with proper authentication and firewall rules.",
        cwe: "CWE-668",
      });
    }
  }

  return findings;
}

export function checkContextOversharing(servers: McpServerEntry[], configPath: string): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  // Check for servers with no explicit env (inherits everything)
  for (const server of servers) {
    if (!server.env && server.command) {
      // Stdio servers without explicit env inherit ALL env vars
      counter++;
      findings.push({
        id: `CFG-CTX-${String(counter).padStart(3, "0")}`,
        title: "Server Inherits All Environment Variables",
        severity: "medium",
        owasp_mcp: "MCP10",
        owasp_mcp_title: "Context Over-sharing & Data Exposure",
        category: "config",
        file: configPath,
        evidence: `Server "${server.name}": no explicit env block — inherits all parent process env vars`,
        remediation: "Add an explicit env block listing only the environment variables this server needs.",
        cwe: "CWE-200",
      });
    }
  }

  // Check for high-value secrets shared across multiple servers
  const secretServers: Record<string, string[]> = {};
  for (const server of servers) {
    if (!server.env) continue;
    for (const [key] of Object.entries(server.env)) {
      const lk = key.toLowerCase();
      if (/key|secret|token|password|credential/.test(lk)) {
        if (!secretServers[key]) secretServers[key] = [];
        secretServers[key].push(server.name);
      }
    }
  }

  for (const [key, serverNames] of Object.entries(secretServers)) {
    if (serverNames.length > 1) {
      counter++;
      findings.push({
        id: `CFG-CTX-${String(counter).padStart(3, "0")}`,
        title: `Secret Shared Across ${serverNames.length} Servers`,
        severity: "medium",
        owasp_mcp: "MCP10",
        owasp_mcp_title: "Context Over-sharing & Data Exposure",
        category: "config",
        file: configPath,
        evidence: `${key} is configured in servers: ${serverNames.join(", ")}`,
        remediation: "Each server should have its own unique credentials. Sharing secrets increases blast radius if one server is compromised.",
        cwe: "CWE-200",
      });
    }
  }

  return findings;
}
