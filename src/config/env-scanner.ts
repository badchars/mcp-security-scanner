import { discoverFiles, safeReadFile, getFileStat } from "../utils/fs-helpers.js";
import type { Finding } from "../types/findings.js";
import { SECRET_PATTERNS } from "../data/secret-patterns.js";

const ENV_FILE_PATTERN = /^\.env(\..+)?$/;

export async function scanEnvFiles(dirPath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let counter = 0;

  const envFiles = await discoverFiles(dirPath, ENV_FILE_PATTERN);

  for (const filePath of envFiles) {
    const content = await safeReadFile(filePath);
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;

      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;

      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");

      if (!value || value.length < 4) continue;

      // Check against secret patterns
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.pattern.test(value) || pattern.pattern.test(line)) {
          counter++;
          findings.push({
            id: `CFG-ENV-${String(counter).padStart(3, "0")}`,
            title: `${pattern.name} in Environment File`,
            severity: pattern.severity,
            owasp_mcp: "MCP01",
            owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
            category: "config",
            file: filePath,
            line: i + 1,
            evidence: `${key}=${value.substring(0, 4)}${"*".repeat(Math.min(value.length - 4, 20))}`,
            remediation: "Ensure .env files are in .gitignore. Use secret management tools for production. Restrict file permissions to owner-only (chmod 600).",
            cwe: "CWE-522",
          });
          break;
        }
      }

      // Check for default/weak credentials
      if (/^(admin|password|pass|root|test|default|changeme|12345|password123|letmein|welcome)$/i.test(value)) {
        counter++;
        findings.push({
          id: `CFG-ENV-${String(counter).padStart(3, "0")}`,
          title: "Default/Weak Credential in Environment File",
          severity: "high",
          owasp_mcp: "MCP01",
          owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
          category: "config",
          file: filePath,
          line: i + 1,
          evidence: `${key}=<default credential>`,
          remediation: "Replace default credentials with strong, unique values. Never use common passwords.",
          cwe: "CWE-798",
        });
      }
    }

    // Check file permissions (Unix/macOS)
    const stat = await getFileStat(filePath);
    if (stat) {
      const mode = stat.mode & 0o777;
      if (mode & 0o044) { // World or group readable
        counter++;
        findings.push({
          id: `CFG-ENV-${String(counter).padStart(3, "0")}`,
          title: "Environment File Has Overly Permissive Permissions",
          severity: "medium",
          owasp_mcp: "MCP01",
          owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
          category: "config",
          file: filePath,
          evidence: `File permissions: ${mode.toString(8)} — readable by group/others`,
          remediation: "Set file permissions to 600 (owner read/write only): chmod 600 " + filePath,
          cwe: "CWE-732",
        });
      }
    }
  }

  return findings;
}
