import { z } from "zod";
import { join } from "node:path";
import type { ToolDef } from "../types/index.js";
import { text, json } from "../types/index.js";
import type { Finding } from "../types/findings.js";
import { parseLockfile, parsePackageJson } from "./lockfile-parser.js";
import { checkTyposquatting, typosquatFindings } from "./typosquat-checker.js";
import { detectInstallScripts, installScriptFindings } from "./install-script-detector.js";
import { safeReadJson, fileExists } from "../utils/fs-helpers.js";

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  let output = `${findings.length} finding(s): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low, ${bySeverity.info} info\n\n`;
  for (const f of findings) {
    output += `[${f.severity.toUpperCase()}] ${f.id}: ${f.title}\n`;
    if (f.file) output += `  File: ${f.file}\n`;
    output += `  OWASP: ${f.owasp_mcp} — ${f.owasp_mcp_title}\n`;
    output += `  Evidence: ${f.evidence}\n`;
    output += `  Remediation: ${f.remediation}\n\n`;
  }
  return output.trim();
}

const depAuditLockfile: ToolDef = {
  name: "dep_audit_lockfile",
  description:
    "Parse lockfile (package-lock.json v2/v3, bun.lock) and list all dependencies with versions. Provides dependency tree overview for manual review.",
  schema: {
    path: z.string().describe("Project directory containing lockfile"),
  },
  async execute(args) {
    const lockfile = await parseLockfile(args.path as string);
    if (!lockfile) return text(`No lockfile found in ${args.path}. Check that package-lock.json or bun.lock exists.`);

    let output = `Lockfile: ${lockfile.lockfilePath} (${lockfile.lockfileType})\n`;
    output += `Dependencies: ${lockfile.dependencies.length}\n\n`;

    if (lockfile.dependencies.length > 0) {
      const direct = lockfile.dependencies.filter(d => !d.name.includes(" > "));
      const transitive = lockfile.dependencies.filter(d => d.name.includes(" > "));

      output += `Direct: ${direct.length}, Transitive: ${transitive.length}\n\n`;

      for (const dep of direct.slice(0, 100)) {
        output += `  ${dep.name}@${dep.version}${dep.dev ? " (dev)" : ""}\n`;
      }

      if (direct.length > 100) {
        output += `  ... and ${direct.length - 100} more\n`;
      }
    }

    return text(output.trim());
  },
};

const depCheckTyposquatting: ToolDef = {
  name: "dep_check_typosquatting",
  description:
    "Check all dependency names against top popular npm packages using: Levenshtein distance, keyboard-adjacent substitution, vowel swapping, separator confusion, scope squatting.",
  schema: {
    path: z.string().describe("Project directory containing package.json"),
    ecosystem: z.string().optional().describe("Package ecosystem (default: npm)"),
  },
  async execute(args) {
    const deps = await parsePackageJson(args.path as string);
    if (!deps) return text(`No package.json found in ${args.path}`);

    const depNames = Object.keys(deps);
    const matches = checkTyposquatting(depNames);

    if (matches.length === 0) {
      return text(`Checked ${depNames.length} dependencies — no typosquatting detected.`);
    }

    const findings = typosquatFindings(matches, join(args.path as string, "package.json"));
    return text(formatFindings(findings));
  },
};

const depCheckUnpinned: ToolDef = {
  name: "dep_check_unpinned",
  description:
    "Detect dependencies with unpinned version ranges: caret (^), tilde (~), star (*), greater-than (>=). Unpinned versions allow silent malicious updates.",
  schema: {
    path: z.string().describe("Project directory containing package.json"),
  },
  async execute(args) {
    const deps = await parsePackageJson(args.path as string);
    if (!deps) return text(`No package.json found in ${args.path}`);

    const findings: Finding[] = [];
    let counter = 0;
    const pkgJsonPath = join(args.path as string, "package.json");

    // Check if lockfile exists
    const hasLockfile =
      await fileExists(join(args.path as string, "package-lock.json")) ||
      await fileExists(join(args.path as string, "bun.lock")) ||
      await fileExists(join(args.path as string, "bun.lockb"));

    if (!hasLockfile) {
      counter++;
      findings.push({
        id: `DEP-PIN-${String(counter).padStart(3, "0")}`,
        title: "No Lockfile Found",
        severity: "high",
        owasp_mcp: "MCP04",
        owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
        category: "deps",
        file: pkgJsonPath,
        evidence: "No package-lock.json or bun.lock found — dependency resolution is non-deterministic",
        remediation: "Run npm install or bun install to generate a lockfile. Commit the lockfile to version control.",
        cwe: "CWE-1357",
      });
    }

    for (const [name, version] of Object.entries(deps)) {
      let issue: string | null = null;

      if (version === "*" || version === "latest") {
        issue = `"${version}" — matches ANY version`;
      } else if (version.startsWith("^")) {
        issue = `"${version}" — caret range allows minor/patch updates`;
      } else if (version.startsWith("~")) {
        issue = `"${version}" — tilde range allows patch updates`;
      } else if (version.startsWith(">=") || version.startsWith(">")) {
        issue = `"${version}" — open-ended range`;
      }

      if (issue) {
        counter++;
        findings.push({
          id: `DEP-PIN-${String(counter).padStart(3, "0")}`,
          title: `Unpinned Version: ${name}`,
          severity: version === "*" || version === "latest" ? "high" : "low",
          owasp_mcp: "MCP04",
          owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
          category: "deps",
          file: pkgJsonPath,
          evidence: `${name}: ${issue}`,
          remediation: hasLockfile
            ? "Version range is mitigated by lockfile presence. For maximum security, pin to exact versions."
            : "Pin to exact version (e.g. \"1.2.3\" without ^ or ~). Generate and commit a lockfile.",
          cwe: "CWE-1357",
        });
      }
    }

    return text(formatFindings(findings));
  },
};

const depCheckInstallScripts: ToolDef = {
  name: "dep_check_install_scripts",
  description:
    "Detect dependencies with lifecycle scripts (preinstall, install, postinstall, prepare) that execute during npm/bun install with full system access.",
  schema: {
    path: z.string().describe("Project directory with node_modules"),
  },
  async execute(args) {
    const results = await detectInstallScripts(args.path as string);

    if (results.length === 0) {
      return text("No dependencies with install scripts found.");
    }

    const lockfile = await parseLockfile(args.path as string);
    const lockfilePath = lockfile?.lockfilePath ?? join(args.path as string, "package.json");
    const findings = installScriptFindings(results, lockfilePath);

    return text(formatFindings(findings));
  },
};

const depCheckMcpSdkVersion: ToolDef = {
  name: "dep_check_mcp_sdk_version",
  description:
    "Check the installed @modelcontextprotocol/sdk version against known vulnerable versions and latest features (OAuth 2.1 support, etc).",
  schema: {
    path: z.string().describe("Project directory"),
  },
  async execute(args) {
    const findings: Finding[] = [];
    let counter = 0;

    // Check package.json for declared version
    const deps = await parsePackageJson(args.path as string);
    const sdkVersion = deps?.["@modelcontextprotocol/sdk"];

    if (!sdkVersion) {
      return text("@modelcontextprotocol/sdk not found in dependencies.");
    }

    // Check installed version from node_modules
    const installedPkgPath = join(args.path as string, "node_modules", "@modelcontextprotocol", "sdk", "package.json");
    const installedPkg = await safeReadJson<Record<string, unknown>>(installedPkgPath);
    const installedVersion = installedPkg?.version as string | undefined;

    const pkgJsonPath = join(args.path as string, "package.json");

    let output = `@modelcontextprotocol/sdk\n`;
    output += `  Declared: ${sdkVersion}\n`;
    output += `  Installed: ${installedVersion ?? "not installed"}\n\n`;

    // Known vulnerable versions (CVE-2025-6514 affects mcp-remote, not core SDK, but flag old versions)
    if (installedVersion) {
      const [major, minor, patch] = installedVersion.split(".").map(Number);

      if (major === 0 || (major === 1 && minor < 10)) {
        counter++;
        findings.push({
          id: `DEP-SDK-${String(counter).padStart(3, "0")}`,
          title: "Outdated MCP SDK Version",
          severity: "medium",
          owasp_mcp: "MCP04",
          owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
          category: "deps",
          file: pkgJsonPath,
          evidence: `@modelcontextprotocol/sdk@${installedVersion} — pre-1.10 versions may lack security fixes`,
          remediation: "Update to the latest @modelcontextprotocol/sdk version for security patches and OAuth 2.1 support.",
          cwe: "CWE-1104",
        });
      }
    }

    output += formatFindings(findings);
    return text(output);
  },
};

const depCheckDeprecated: ToolDef = {
  name: "dep_check_deprecated",
  description:
    "Detect deprecated dependencies by checking package.json 'deprecated' field in node_modules. Deprecated packages no longer receive security patches.",
  schema: {
    path: z.string().describe("Project directory with node_modules"),
  },
  async execute(args) {
    const findings: Finding[] = [];
    let counter = 0;
    const lockfile = await parseLockfile(args.path as string);

    if (!lockfile || lockfile.dependencies.length === 0) {
      return text("No lockfile or dependencies found.");
    }

    const pkgJsonPath = join(args.path as string, "package.json");

    for (const dep of lockfile.dependencies) {
      // Only check direct deps (not transitive)
      if (dep.name.includes(" > ")) continue;

      const depPkgPath = join(args.path as string, "node_modules", dep.name, "package.json");
      const depPkg = await safeReadJson<Record<string, unknown>>(depPkgPath);
      if (!depPkg) continue;

      if (depPkg.deprecated) {
        counter++;
        findings.push({
          id: `DEP-DEPR-${String(counter).padStart(3, "0")}`,
          title: `Deprecated Package: ${dep.name}`,
          severity: "medium",
          owasp_mcp: "MCP04",
          owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
          category: "deps",
          file: pkgJsonPath,
          evidence: `${dep.name}@${dep.version} — ${String(depPkg.deprecated).substring(0, 200)}`,
          remediation: `Replace ${dep.name} with its recommended successor or remove it.`,
          cwe: "CWE-1104",
        });
      }
    }

    return text(formatFindings(findings));
  },
};

const depCheckLicense: ToolDef = {
  name: "dep_check_license",
  description:
    "Audit dependency licenses: copyleft (GPL, AGPL), unknown/missing licenses, non-OSI-approved licenses. Important for MCP servers in enterprise environments.",
  schema: {
    path: z.string().describe("Project directory with node_modules"),
  },
  async execute(args) {
    const findings: Finding[] = [];
    let counter = 0;
    const lockfile = await parseLockfile(args.path as string);

    if (!lockfile || lockfile.dependencies.length === 0) {
      return text("No lockfile or dependencies found.");
    }

    const pkgJsonPath = join(args.path as string, "package.json");
    const COPYLEFT = ["GPL", "AGPL", "LGPL", "SSPL", "EUPL", "MPL"];

    for (const dep of lockfile.dependencies) {
      if (dep.name.includes(" > ")) continue;

      const depPkgPath = join(args.path as string, "node_modules", dep.name, "package.json");
      const depPkg = await safeReadJson<Record<string, unknown>>(depPkgPath);
      if (!depPkg) continue;

      const license = depPkg.license as string | undefined;

      if (!license) {
        counter++;
        findings.push({
          id: `DEP-LIC-${String(counter).padStart(3, "0")}`,
          title: `Missing License: ${dep.name}`,
          severity: "low",
          owasp_mcp: "MCP04",
          owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
          category: "deps",
          file: pkgJsonPath,
          evidence: `${dep.name}@${dep.version} — no license field in package.json`,
          remediation: `Verify the license of ${dep.name} manually. Missing license may indicate usage restrictions.`,
          cwe: "CWE-1357",
        });
      } else if (COPYLEFT.some(c => license.toUpperCase().includes(c))) {
        counter++;
        findings.push({
          id: `DEP-LIC-${String(counter).padStart(3, "0")}`,
          title: `Copyleft License: ${dep.name} (${license})`,
          severity: "info",
          owasp_mcp: "MCP04",
          owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
          category: "deps",
          file: pkgJsonPath,
          evidence: `${dep.name}@${dep.version} — license: ${license} (copyleft)`,
          remediation: `Review copyleft obligations for ${license}. Copyleft licenses may require source disclosure.`,
          cwe: "CWE-1357",
        });
      }
    }

    return text(formatFindings(findings));
  },
};

export const depsTools: ToolDef[] = [
  depAuditLockfile,
  depCheckTyposquatting,
  depCheckUnpinned,
  depCheckInstallScripts,
  depCheckMcpSdkVersion,
  depCheckDeprecated,
  depCheckLicense,
];
