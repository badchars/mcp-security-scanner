import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findStringLiterals, getLocation, SyntaxKind } from "../ast-engine.js";

// Patterns that indicate ReDoS vulnerability
const REDOS_PATTERNS: RegExp[] = [
  /\(.*[+*].*\)[+*]/,           // Nested quantifiers: (a+)+
  /\(.*\|.*\)[+*]/,             // Alternation in quantified group: (a|b)+
  /\([^)]*[+*][^)]*[+*][^)]*\)/, // Multiple quantifiers in group
  /(.)\+\1\+/,                   // Overlapping quantifiers like a+a+
];

export function analyzeRegexDos(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    // Check RegExp literals
    const regexLiterals = sf.getDescendantsOfKind(SyntaxKind.RegularExpressionLiteral);
    for (const regex of regexLiterals) {
      const text = regex.getText();
      // Remove the /flags part to get pattern
      const pattern = text.slice(1, text.lastIndexOf("/"));

      for (const redos of REDOS_PATTERNS) {
        if (redos.test(pattern)) {
          const loc = getLocation(regex);
          counter++;
          findings.push({
            id: `SAST-REDOS-${String(counter).padStart(3, "0")}`,
            title: "Potential ReDoS Pattern",
            severity: "medium",
            owasp_mcp: "MCP05",
            owasp_mcp_title: "Command Injection & Code Execution",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: `Regex literal with potential catastrophic backtracking: ${text.substring(0, 100)}`,
            remediation: "Refactor regex to avoid nested quantifiers and overlapping alternations. Consider using a regex engine with backtracking limits.",
            cwe: "CWE-1333",
          });
          break;
        }
      }
    }

    // Check new RegExp() with string arguments for same patterns
    const newExprs = sf.getDescendantsOfKind(SyntaxKind.NewExpression);
    for (const expr of newExprs) {
      if (expr.getExpression().getText() !== "RegExp") continue;
      const args = expr.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0];
      if (firstArg.getKind() === SyntaxKind.StringLiteral) {
        const pattern = firstArg.getText().replace(/^['"]|['"]$/g, "");
        for (const redos of REDOS_PATTERNS) {
          if (redos.test(pattern)) {
            const loc = getLocation(expr);
            counter++;
            findings.push({
              id: `SAST-REDOS-${String(counter).padStart(3, "0")}`,
              title: "Potential ReDoS in new RegExp()",
              severity: "medium",
              owasp_mcp: "MCP05",
              owasp_mcp_title: "Command Injection & Code Execution",
              category: "static",
              file: loc.file,
              line: loc.line,
              column: loc.column,
              evidence: `new RegExp() with potential backtracking: ${expr.getText().substring(0, 100)}`,
              remediation: "Refactor regex pattern to avoid nested quantifiers. Consider using a safe regex library.",
              cwe: "CWE-1333",
            });
            break;
          }
        }
      }
    }
  }

  return findings;
}
