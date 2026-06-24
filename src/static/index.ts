import { z } from "zod";
import type { ToolDef } from "../types/index.js";
import { text, json } from "../types/index.js";
import type { Finding } from "../types/findings.js";
import { initProject } from "./ast-engine.js";
import { analyzeCommandInjection } from "./analyzers/command-injection.js";
import { analyzeSsrf } from "./analyzers/ssrf.js";
import { analyzePathTraversal } from "./analyzers/path-traversal.js";
import { analyzeCodeExecution } from "./analyzers/code-execution.js";
import { analyzeHardcodedSecrets } from "./analyzers/secret-hardcoded.js";
import { analyzeLogging } from "./analyzers/logging-audit.js";
import { analyzeInsecureCrypto } from "./analyzers/insecure-crypto.js";
import { analyzePrototypePollution } from "./analyzers/prototype-pollution.js";
import { analyzeRegexDos } from "./analyzers/regex-dos.js";
import { analyzeUnsafeRegex } from "./analyzers/unsafe-regex.js";
import { analyzeInfoDisclosure } from "./analyzers/info-disclosure.js";

const pathSchema = {
  path: z.string().describe("Directory path containing TypeScript/JavaScript source files to analyze"),
  include_node_modules: z.boolean().optional().describe("Include node_modules in scan (default: false)"),
  tsconfig_path: z.string().optional().describe("Path to tsconfig.json (optional)"),
};

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;

  let output = `${findings.length} finding(s): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low, ${bySeverity.info} info\n\n`;

  for (const f of findings) {
    output += `[${f.severity.toUpperCase()}] ${f.id}: ${f.title}\n`;
    if (f.file) output += `  File: ${f.file}:${f.line ?? 0}:${f.column ?? 0}\n`;
    output += `  OWASP: ${f.owasp_mcp} — ${f.owasp_mcp_title}\n`;
    output += `  Evidence: ${f.evidence}\n`;
    output += `  Remediation: ${f.remediation}\n\n`;
  }

  return output.trim();
}

const allAnalyzers: { name: string; fn: (files: any[]) => Finding[] }[] = [
  { name: "command-injection", fn: analyzeCommandInjection },
  { name: "ssrf", fn: analyzeSsrf },
  { name: "path-traversal", fn: analyzePathTraversal },
  { name: "code-execution", fn: analyzeCodeExecution },
  { name: "hardcoded-secrets", fn: analyzeHardcodedSecrets },
  { name: "logging-audit", fn: analyzeLogging },
  { name: "insecure-crypto", fn: analyzeInsecureCrypto },
  { name: "prototype-pollution", fn: analyzePrototypePollution },
  { name: "regex-dos", fn: analyzeRegexDos },
  { name: "unsafe-regex", fn: analyzeUnsafeRegex },
  { name: "info-disclosure", fn: analyzeInfoDisclosure },
];

const sastScanDirectory: ToolDef = {
  name: "sast_scan_directory",
  description:
    "Run ALL static analysis checks on a TypeScript/JavaScript source directory. Initializes AST project, discovers source files, runs all 11 analyzers, and returns aggregated findings sorted by severity.",
  schema: pathSchema,
  async execute(args) {
    const { project, sourceFiles, rootDir } = initProject(
      args.path as string,
      args.tsconfig_path as string | undefined,
    );

    if (sourceFiles.length === 0) {
      return text(`No source files found in ${args.path}`);
    }

    const allFindings: Finding[] = [];
    for (const analyzer of allAnalyzers) {
      try {
        const findings = analyzer.fn(sourceFiles);
        allFindings.push(...findings);
      } catch (err) {
        allFindings.push({
          id: `SAST-ERR-${analyzer.name}`,
          title: `Analyzer Error: ${analyzer.name}`,
          severity: "info",
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          evidence: `${analyzer.name} analyzer threw: ${err instanceof Error ? err.message : String(err)}`,
          remediation: "This is an internal scanner error, not a finding in your code.",
        });
      }
    }

    // Sort by severity
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    allFindings.sort((a, b) => order[a.severity] - order[b.severity]);

    let header = `Scanned ${sourceFiles.length} files in ${rootDir}\n\n`;
    return text(header + formatFindings(allFindings));
  },
};

function makeSingleAnalyzerTool(
  name: string,
  description: string,
  analyzerFn: (files: any[]) => Finding[],
): ToolDef {
  return {
    name,
    description,
    schema: { path: z.string().describe("Directory path containing source files to analyze") },
    async execute(args) {
      const { sourceFiles, rootDir } = initProject(args.path as string);
      if (sourceFiles.length === 0) return text(`No source files found in ${args.path}`);
      const findings = analyzerFn(sourceFiles);
      let header = `Scanned ${sourceFiles.length} files in ${rootDir}\n\n`;
      return text(header + formatFindings(findings));
    },
  };
}

export const staticTools: ToolDef[] = [
  sastScanDirectory,
  makeSingleAnalyzerTool(
    "sast_command_injection",
    "AST-scan for command injection: child_process.exec(), execSync(), spawn() with shell:true — where arguments include user-controlled input. Reports file, line, column, and the exact dangerous expression.",
    analyzeCommandInjection,
  ),
  makeSingleAnalyzerTool(
    "sast_ssrf",
    "AST-scan for SSRF: fetch(), axios.get/post(), http.request() — where the URL argument contains user-controlled input without domain validation.",
    analyzeSsrf,
  ),
  makeSingleAnalyzerTool(
    "sast_path_traversal",
    "AST-scan for path traversal: fs.readFile(), writeFile(), readdir(), unlink() — where path argument includes user input without path.resolve() validation.",
    analyzePathTraversal,
  ),
  makeSingleAnalyzerTool(
    "sast_code_execution",
    "AST-scan for dangerous code execution: eval(), new Function(), vm.runInNewContext(), setTimeout(string). Any occurrence is flagged regardless of input source.",
    analyzeCodeExecution,
  ),
  makeSingleAnalyzerTool(
    "sast_hardcoded_secrets",
    "Scan all string literals and template literals for hardcoded secrets using 20+ regex patterns: AWS keys, GitHub tokens, Slack tokens, Stripe keys, private keys, JWTs, database URLs, and more.",
    analyzeHardcodedSecrets,
  ),
  makeSingleAnalyzerTool(
    "sast_missing_logging",
    "Detect missing security controls: tool handlers without try-catch, empty catch blocks, stack trace exposure in responses, missing audit logging.",
    analyzeLogging,
  ),
  makeSingleAnalyzerTool(
    "sast_insecure_crypto",
    "Detect weak cryptography: createHash('md5'), createHash('sha1'), Math.random() for token generation, DES/RC4 usage.",
    analyzeInsecureCrypto,
  ),
  makeSingleAnalyzerTool(
    "sast_prototype_pollution",
    "Detect prototype pollution: Object.assign() with user input, JSON.parse() on untrusted data, bracket notation with user-controlled keys.",
    analyzePrototypePollution,
  ),
  makeSingleAnalyzerTool(
    "sast_regex_dos",
    "Detect ReDoS patterns: nested quantifiers (a+)+, alternation with overlap, backreferences in quantified groups.",
    analyzeRegexDos,
  ),
  makeSingleAnalyzerTool(
    "sast_unsafe_regex",
    "Detect new RegExp() with user-controlled input without proper escaping. Attacker-controlled regex can cause ReDoS or bypass validation.",
    analyzeUnsafeRegex,
  ),
  makeSingleAnalyzerTool(
    "sast_info_disclosure",
    "Detect information disclosure: sensitive data in console.log, process.env serialization, stack traces in responses, file paths in error messages.",
    analyzeInfoDisclosure,
  ),
];
