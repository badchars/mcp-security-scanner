import type { Finding, ScanReport, OwaspComplianceEntry, OwaspMcpId, Severity } from "../types/findings.js";
import { OWASP_MCP_TOP10 } from "../data/owasp-mcp-top10.js";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function buildScanReport(
  target: string,
  findings: Finding[],
  durationMs: number,
): ScanReport {
  const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    summary.total++;
    summary[f.severity]++;
  }

  // Build OWASP compliance
  const owasp_compliance: OwaspComplianceEntry[] = OWASP_MCP_TOP10.map(cat => {
    const catFindings = findings.filter(f => f.owasp_mcp === cat.id);
    let highest: Severity | null = null;

    for (const f of catFindings) {
      if (!highest || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[highest]) {
        highest = f.severity;
      }
    }

    const tested = catFindings.length > 0;
    const failed = catFindings.some(f => f.severity === "critical" || f.severity === "high" || f.severity === "medium");

    return {
      id: cat.id as OwaspMcpId,
      title: cat.title,
      status: tested ? (failed ? "fail" as const : "pass" as const) : "not_tested" as const,
      finding_count: catFindings.length,
      highest_severity: highest,
    };
  });

  // Sort findings by severity
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    scanner: "mcp-security-scanner",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    target,
    duration_ms: durationMs,
    summary,
    owasp_compliance,
    findings,
  };
}

export function buildOwaspCompliance(findings: Finding[]): OwaspComplianceEntry[] {
  return OWASP_MCP_TOP10.map(cat => {
    const catFindings = findings.filter(f => f.owasp_mcp === cat.id);
    let highest: Severity | null = null;

    for (const f of catFindings) {
      if (!highest || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[highest]) {
        highest = f.severity;
      }
    }

    const tested = catFindings.length > 0;
    const failed = catFindings.some(f => f.severity === "critical" || f.severity === "high" || f.severity === "medium");

    return {
      id: cat.id as OwaspMcpId,
      title: cat.title,
      status: tested ? (failed ? "fail" as const : "pass" as const) : "not_tested" as const,
      finding_count: catFindings.length,
      highest_severity: highest,
    };
  });
}
