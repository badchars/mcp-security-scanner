import type { ScanReport, Finding } from "../types/findings.js";

interface SarifRun {
  tool: { driver: { name: string; version: string; rules: SarifRule[] } };
  results: SarifResult[];
}

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  defaultConfiguration: { level: string };
  helpUri?: string;
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations?: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number; startColumn?: number } } }[];
  fixes?: { description: { text: string } }[];
}

function severityToLevel(severity: string): string {
  switch (severity) {
    case "critical": return "error";
    case "high": return "error";
    case "medium": return "warning";
    case "low": return "note";
    case "info": return "note";
    default: return "note";
  }
}

export function generateSarifReport(report: ScanReport): object {
  const rulesMap = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const finding of report.findings) {
    // Create rule if not exists
    if (!rulesMap.has(finding.id)) {
      rulesMap.set(finding.id, {
        id: finding.id,
        shortDescription: { text: finding.title },
        fullDescription: { text: `[${finding.owasp_mcp}] ${finding.owasp_mcp_title}: ${finding.title}` },
        defaultConfiguration: { level: severityToLevel(finding.severity) },
        helpUri: finding.references?.[0],
      });
    }

    const result: SarifResult = {
      ruleId: finding.id,
      level: severityToLevel(finding.severity),
      message: { text: `${finding.evidence}\n\nRemediation: ${finding.remediation}` },
    };

    if (finding.file) {
      result.locations = [{
        physicalLocation: {
          artifactLocation: { uri: finding.file },
          region: finding.line ? { startLine: finding.line, startColumn: finding.column } : undefined,
        },
      }];
    }

    results.push(result);
  }

  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: report.scanner,
          version: report.version,
          rules: Array.from(rulesMap.values()),
        },
      },
      results,
    }],
  };

  return sarif;
}
