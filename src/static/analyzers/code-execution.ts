import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getQualifiedCallName, getLocation, SyntaxKind } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";

const DANGEROUS_GLOBALS = new Set(["eval"]);
const DANGEROUS_QUALIFIED = new Set(["vm.runInNewContext", "vm.runInThisContext", "vm.compileFunction"]);
const DANGEROUS_NEW = new Set(["Function", "vm.Script"]);

export function analyzeCodeExecution(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    // Check call expressions
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const name = getCallName(call);
      const qname = getQualifiedCallName(call);

      let found = false;
      if (DANGEROUS_GLOBALS.has(name)) found = true;
      if (DANGEROUS_QUALIFIED.has(qname)) found = true;

      // setTimeout/setInterval with string argument
      if ((name === "setTimeout" || name === "setInterval") && call.getArguments().length > 0) {
        const firstArg = call.getArguments()[0];
        if (firstArg.getKind() === SyntaxKind.StringLiteral || firstArg.getKind() === SyntaxKind.TemplateExpression) {
          found = true;
        }
      }

      if (found) {
        const loc = getLocation(call);
        counter++;
        findings.push({
          id: `SAST-EXEC-${String(counter).padStart(3, "0")}`,
          title: `Dangerous Code Execution: ${qname || name}()`,
          severity: "critical",
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: getCallEvidence(call),
          remediation: "Remove eval/Function/vm usage entirely. If dynamic behavior is needed, use a safe sandboxing approach or predefined function maps.",
          cwe: "CWE-94",
        });
      }
    }

    // Check new expressions: new Function(...)
    const newExprs = sf.getDescendantsOfKind(SyntaxKind.NewExpression);
    for (const expr of newExprs) {
      const name = expr.getExpression().getText();
      if (DANGEROUS_NEW.has(name)) {
        const loc = getLocation(expr);
        counter++;
        findings.push({
          id: `SAST-EXEC-${String(counter).padStart(3, "0")}`,
          title: `Dangerous Code Execution: new ${name}()`,
          severity: "critical",
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: expr.getText().substring(0, 200),
          remediation: "Never use new Function() or new vm.Script() with untrusted input. Use predefined function maps instead.",
          cwe: "CWE-94",
        });
      }
    }
  }

  return findings;
}
