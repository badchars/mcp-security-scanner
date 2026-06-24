import { z } from "zod";
import { join, resolve } from "node:path";
import type { ToolDef } from "../types/index.js";
import { text, json } from "../types/index.js";
import type { Finding } from "../types/findings.js";
import { generateMarkdownReport } from "./markdown.js";
import { generateSarifReport } from "./sarif.js";
import { buildScanReport, buildOwaspCompliance } from "./json-report.js";
import { safeReadJson, fileExists } from "../utils/fs-helpers.js";

// SAST imports
import { initProject } from "../static/ast-engine.js";
import { analyzeCommandInjection } from "../static/analyzers/command-injection.js";
import { analyzeSsrf } from "../static/analyzers/ssrf.js";
import { analyzePathTraversal } from "../static/analyzers/path-traversal.js";
import { analyzeCodeExecution } from "../static/analyzers/code-execution.js";
import { analyzeHardcodedSecrets } from "../static/analyzers/secret-hardcoded.js";
import { analyzeLogging } from "../static/analyzers/logging-audit.js";
import { analyzeInsecureCrypto } from "../static/analyzers/insecure-crypto.js";
import { analyzePrototypePollution } from "../static/analyzers/prototype-pollution.js";
import { analyzeRegexDos } from "../static/analyzers/regex-dos.js";
import { analyzeUnsafeRegex } from "../static/analyzers/unsafe-regex.js";
import { analyzeInfoDisclosure } from "../static/analyzers/info-disclosure.js";

// Config imports
import { scanEnvFiles } from "../config/env-scanner.js";
import { parseConfigFile } from "../config/mcp-config-parser.js";
import { auditServerEntry, checkContextOversharing } from "../config/server-verification.js";

// Deps imports
import { parseLockfile, parsePackageJson } from "../deps/lockfile-parser.js";
import { checkTyposquatting, typosquatFindings } from "../deps/typosquat-checker.js";
import { detectInstallScripts, installScriptFindings } from "../deps/install-script-detector.js";

// Runtime imports
import { connectAndInspect } from "../runtime/client.js";
import { analyzePoisoning, analyzeAnsiInjection, analyzeUnicodeSteganography } from "../runtime/tool-analyzer.js";
import { analyzeScope, analyzeToolShadowing, analyzeCrossOrigin, analyzeResourceExposure } from "../runtime/schema-analyzer.js";

const allSastAnalyzers = [
  analyzeCommandInjection, analyzeSsrf, analyzePathTraversal, analyzeCodeExecution,
  analyzeHardcodedSecrets, analyzeLogging, analyzeInsecureCrypto, analyzePrototypePollution,
  analyzeRegexDos, analyzeUnsafeRegex, analyzeInfoDisclosure,
];

const reportGenerate: ToolDef = {
  name: "report_generate",
  description:
    "Generate formatted security report from findings array. Supports JSON (structured), Markdown (human-readable with severity table, OWASP matrix, remediation checklist), and SARIF 2.1.0 (for GitHub Code Scanning).",
  schema: {
    findings: z.string().describe("JSON string of Finding[] array"),
    format: z.enum(["json", "markdown", "sarif"]).optional().describe("Output format (default: json)"),
    target: z.string().optional().describe("Target name for report header"),
  },
  async execute(args) {
    let findings: Finding[];
    try {
      findings = JSON.parse(args.findings as string);
    } catch {
      return text("Invalid findings JSON. Provide a valid JSON array of Finding objects.");
    }

    const format = (args.format as string) ?? "json";
    const report = buildScanReport(
      (args.target as string) ?? "unknown",
      findings,
      0,
    );

    if (format === "markdown") {
      return text(generateMarkdownReport(report));
    } else if (format === "sarif") {
      return json(generateSarifReport(report));
    } else {
      return json(report);
    }
  },
};

const reportOwaspCompliance: ToolDef = {
  name: "report_owasp_compliance",
  description:
    "Generate OWASP MCP Top 10 compliance matrix from findings. For each MCP01-MCP10: pass/fail/not_tested status, finding count, highest severity, overall compliance score (0-100).",
  schema: {
    findings: z.string().describe("JSON string of Finding[] array"),
  },
  async execute(args) {
    let findings: Finding[];
    try {
      findings = JSON.parse(args.findings as string);
    } catch {
      return text("Invalid findings JSON.");
    }

    const compliance = buildOwaspCompliance(findings);

    const passed = compliance.filter(e => e.status === "pass").length;
    const failed = compliance.filter(e => e.status === "fail").length;
    const notTested = compliance.filter(e => e.status === "not_tested").length;
    const tested = passed + failed;
    const score = tested > 0 ? Math.round((passed / tested) * 100) : 0;

    let output = `OWASP MCP Top 10 Compliance Score: ${score}/100\n`;
    output += `Passed: ${passed}, Failed: ${failed}, Not Tested: ${notTested}\n\n`;

    for (const entry of compliance) {
      const icon = entry.status === "pass" ? "PASS" : entry.status === "fail" ? "FAIL" : "N/T";
      output += `[${icon}] ${entry.id}: ${entry.title}`;
      if (entry.finding_count > 0) {
        output += ` — ${entry.finding_count} findings (highest: ${entry.highest_severity})`;
      }
      output += "\n";
    }

    return text(output.trim());
  },
};

const reportCompare: ToolDef = {
  name: "report_compare",
  description:
    "Compare two scan reports (JSON format). Shows new findings, resolved findings, unchanged findings, regression count, and OWASP category trends.",
  schema: {
    before_path: z.string().describe("Path to the earlier scan report (JSON)"),
    after_path: z.string().describe("Path to the later scan report (JSON)"),
  },
  async execute(args) {
    const before = await safeReadJson<{ findings: Finding[] }>(args.before_path as string);
    const after = await safeReadJson<{ findings: Finding[] }>(args.after_path as string);

    if (!before) return text(`Could not read before report: ${args.before_path}`);
    if (!after) return text(`Could not read after report: ${args.after_path}`);

    const beforeIds = new Set(before.findings.map(f => f.id));
    const afterIds = new Set(after.findings.map(f => f.id));

    const newFindings = after.findings.filter(f => !beforeIds.has(f.id));
    const resolved = before.findings.filter(f => !afterIds.has(f.id));
    const unchanged = after.findings.filter(f => beforeIds.has(f.id));

    let output = `Report Comparison\n`;
    output += `Before: ${before.findings.length} findings\n`;
    output += `After: ${after.findings.length} findings\n\n`;
    output += `New: ${newFindings.length}\n`;
    output += `Resolved: ${resolved.length}\n`;
    output += `Unchanged: ${unchanged.length}\n\n`;

    if (newFindings.length > 0) {
      output += `New Findings (regressions):\n`;
      for (const f of newFindings) {
        output += `  + [${f.severity.toUpperCase()}] ${f.id}: ${f.title}\n`;
      }
      output += "\n";
    }

    if (resolved.length > 0) {
      output += `Resolved Findings (improvements):\n`;
      for (const f of resolved) {
        output += `  - [${f.severity.toUpperCase()}] ${f.id}: ${f.title}\n`;
      }
      output += "\n";
    }

    return text(output.trim());
  },
};

const reportFullAudit: ToolDef = {
  name: "report_full_audit",
  description:
    "Orchestrator tool. Run ALL applicable checks on a project directory: static analysis on source, config audit, dependency audit, and optionally runtime inspection if command is provided. Generates combined report.",
  schema: {
    path: z.string().describe("Project directory to audit"),
    command: z.string().optional().describe("Server command for runtime checks (e.g. 'bun', 'node')"),
    args: z.array(z.string()).optional().describe("Server command arguments"),
    report_format: z.enum(["json", "markdown", "sarif"]).optional().describe("Output format (default: json)"),
  },
  async execute(args, ctx) {
    const projectPath = resolve(args.path as string);
    const allFindings: Finding[] = [];
    const startTime = Date.now();
    const sections: string[] = [];

    // 1. Static Analysis
    try {
      const srcDir = (await fileExists(join(projectPath, "src"))) ? join(projectPath, "src") : projectPath;
      const { sourceFiles } = initProject(srcDir);

      if (sourceFiles.length > 0) {
        sections.push(`Static Analysis: scanning ${sourceFiles.length} files...`);
        for (const analyzer of allSastAnalyzers) {
          try {
            allFindings.push(...analyzer(sourceFiles));
          } catch { /* skip failed analyzer */ }
        }
      }
    } catch { /* no source files */ }

    // 2. Config Audit
    try {
      // Check for .env files
      const envFindings = await scanEnvFiles(projectPath);
      allFindings.push(...envFindings);

      // Check for MCP config files in project
      const mcpConfigPaths = [
        join(projectPath, ".mcp.json"),
        join(projectPath, "mcp.json"),
      ];

      for (const cfgPath of mcpConfigPaths) {
        if (await fileExists(cfgPath)) {
          const config = await parseConfigFile(cfgPath);
          if (config) {
            for (const server of config.servers) {
              allFindings.push(...auditServerEntry(server, cfgPath));
            }
            allFindings.push(...checkContextOversharing(config.servers, cfgPath));
          }
        }
      }
    } catch { /* config scan failed */ }

    // 3. Dependency Analysis
    try {
      const deps = await parsePackageJson(projectPath);
      if (deps) {
        // Typosquatting
        const matches = checkTyposquatting(Object.keys(deps));
        allFindings.push(...typosquatFindings(matches, join(projectPath, "package.json")));

        // Install scripts
        const scripts = await detectInstallScripts(projectPath);
        const lockfile = await parseLockfile(projectPath);
        allFindings.push(...installScriptFindings(scripts, lockfile?.lockfilePath ?? join(projectPath, "package.json")));

        // Unpinned versions
        for (const [name, version] of Object.entries(deps)) {
          if (version === "*" || version === "latest") {
            allFindings.push({
              id: `DEP-PIN-AUTO`,
              title: `Unpinned Version: ${name}`,
              severity: "high",
              owasp_mcp: "MCP04",
              owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
              category: "deps",
              file: join(projectPath, "package.json"),
              evidence: `${name}: "${version}"`,
              remediation: "Pin to exact version.",
              cwe: "CWE-1357",
            });
          }
        }
      }
    } catch { /* deps scan failed */ }

    // 4. Runtime Inspection (if command provided)
    if (args.command) {
      try {
        const manifest = await connectAndInspect(
          args.command as string,
          args.args as string[] | undefined,
          {},
          30_000,
        );

        allFindings.push(...analyzePoisoning(manifest.tools));
        allFindings.push(...analyzeAnsiInjection(manifest.tools));
        allFindings.push(...analyzeUnicodeSteganography(manifest.tools));
        allFindings.push(...analyzeScope(manifest.tools));
        allFindings.push(...analyzeToolShadowing(manifest.tools));
        allFindings.push(...analyzeCrossOrigin(manifest.tools));
        allFindings.push(...analyzeResourceExposure(manifest.resources, manifest.prompts));
      } catch { /* runtime scan failed */ }
    }

    const durationMs = Date.now() - startTime;
    const report = buildScanReport(projectPath, allFindings, durationMs);
    const format = (args.report_format as string) ?? "json";

    if (format === "markdown") {
      return text(generateMarkdownReport(report));
    } else if (format === "sarif") {
      return json(generateSarifReport(report));
    } else {
      return json(report);
    }
  },
};

export const reportTools: ToolDef[] = [
  reportGenerate,
  reportOwaspCompliance,
  reportCompare,
  reportFullAudit,
];
