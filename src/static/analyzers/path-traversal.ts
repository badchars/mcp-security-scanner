import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getLocation, containsUserInput } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";
import { PATH_TRAVERSAL_SINKS } from "../../data/dangerous-sinks.js";

const sinkNames = new Set(PATH_TRAVERSAL_SINKS.map(s => s.name));

export function analyzePathTraversal(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const name = getCallName(call);
      if (!sinkNames.has(name)) continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      // The first argument is usually the path
      const pathArg = args[0];
      if (!containsUserInput(pathArg)) continue;

      const sink = PATH_TRAVERSAL_SINKS.find(s => s.name === name)!;
      const loc = getLocation(call);
      counter++;

      findings.push({
        id: `SAST-PATH-${String(counter).padStart(3, "0")}`,
        title: `Path Traversal via ${name}()`,
        severity: sink.severity as Finding["severity"],
        owasp_mcp: "MCP05",
        owasp_mcp_title: "Command Injection & Code Execution",
        category: "static",
        file: loc.file,
        line: loc.line,
        column: loc.column,
        evidence: getCallEvidence(call),
        remediation: "Resolve paths with path.resolve() and validate they fall within an allowed base directory. Never pass user input directly to fs operations.",
        cwe: "CWE-22",
      });
    }
  }

  return findings;
}
