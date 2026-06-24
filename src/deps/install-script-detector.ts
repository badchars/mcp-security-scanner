import { join } from "node:path";
import { safeReadJson } from "../utils/fs-helpers.js";
import { readdir } from "node:fs/promises";
import type { Finding } from "../types/findings.js";

const DANGEROUS_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"];

export interface InstallScriptResult {
  package: string;
  version: string;
  scripts: Record<string, string>;
}

export async function detectInstallScripts(projectPath: string): Promise<InstallScriptResult[]> {
  const results: InstallScriptResult[] = [];
  const nodeModulesPath = join(projectPath, "node_modules");

  let entries;
  try {
    entries = await readdir(nodeModulesPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith("@")) {
      // Scoped package — look one level deeper
      const scopePath = join(nodeModulesPath, entry.name);
      let scopeEntries;
      try {
        scopeEntries = await readdir(scopePath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue;
        const fullName = `${entry.name}/${scopeEntry.name}`;
        const result = await checkPackageScripts(nodeModulesPath, fullName);
        if (result) results.push(result);
      }
    } else if (!entry.name.startsWith(".")) {
      const result = await checkPackageScripts(nodeModulesPath, entry.name);
      if (result) results.push(result);
    }
  }

  return results;
}

async function checkPackageScripts(nodeModulesPath: string, packageName: string): Promise<InstallScriptResult | null> {
  const pkgJsonPath = join(nodeModulesPath, packageName, "package.json");
  const pkg = await safeReadJson<Record<string, unknown>>(pkgJsonPath);
  if (!pkg) return null;

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts) return null;

  const dangerousScripts: Record<string, string> = {};
  for (const scriptName of DANGEROUS_SCRIPTS) {
    if (scripts[scriptName]) {
      dangerousScripts[scriptName] = scripts[scriptName];
    }
  }

  if (Object.keys(dangerousScripts).length === 0) return null;

  return {
    package: packageName,
    version: (pkg.version as string) ?? "unknown",
    scripts: dangerousScripts,
  };
}

export function installScriptFindings(results: InstallScriptResult[], lockfilePath: string): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const result of results) {
    for (const [scriptName, scriptContent] of Object.entries(result.scripts)) {
      counter++;

      // Determine severity based on script content
      let severity: Finding["severity"] = "medium";
      const lowerContent = scriptContent.toLowerCase();
      if (/curl|wget|http|eval|exec|\.sh|bash|powershell|cmd/.test(lowerContent)) {
        severity = "high";
      }
      if (/rm\s+-rf|del\s+\/|format\s+/.test(lowerContent)) {
        severity = "critical";
      }

      findings.push({
        id: `DEP-SCRIPT-${String(counter).padStart(3, "0")}`,
        title: `Install Script in ${result.package}: ${scriptName}`,
        severity,
        owasp_mcp: "MCP04",
        owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
        category: "deps",
        file: lockfilePath,
        evidence: `${result.package}@${result.version} — ${scriptName}: "${scriptContent.substring(0, 200)}"`,
        remediation: `Review the ${scriptName} script in ${result.package}. Consider using --ignore-scripts during install if the script is unnecessary.`,
        cwe: "CWE-829",
      });
    }
  }

  return findings;
}
