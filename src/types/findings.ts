// ─── OWASP MCP Top 10 Categories ───

export type OwaspMcpId =
  | "MCP01"
  | "MCP02"
  | "MCP03"
  | "MCP04"
  | "MCP05"
  | "MCP06"
  | "MCP07"
  | "MCP08"
  | "MCP09"
  | "MCP10";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory = "runtime" | "static" | "config" | "deps" | "report";

// ─── Finding ───

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  owasp_mcp: OwaspMcpId;
  owasp_mcp_title: string;
  category: FindingCategory;
  file?: string;
  line?: number;
  column?: number;
  evidence: string;
  remediation: string;
  cwe?: string;
  references?: string[];
}

// ─── Tool Pin (for rug-pull detection) ───

export interface ToolPin {
  name: string;
  hash: string;
  description_preview: string;
}

export interface PinFile {
  pin_name: string;
  server_command?: string;
  server_args?: string[];
  server_url?: string;
  timestamp: string;
  tool_count: number;
  manifest_hash: string;
  tools: ToolPin[];
}

// ─── Scan Report ───

export interface ScanReport {
  scanner: string;
  version: string;
  timestamp: string;
  target: string;
  duration_ms: number;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  owasp_compliance: OwaspComplianceEntry[];
  findings: Finding[];
}

export interface OwaspComplianceEntry {
  id: OwaspMcpId;
  title: string;
  status: "pass" | "fail" | "not_tested";
  finding_count: number;
  highest_severity: Severity | null;
}

// ─── Helper to create findings ───

export function createFinding(
  partial: Omit<Finding, "id"> & { id?: string },
  idPrefix: string,
  counter: number,
): Finding {
  return {
    ...partial,
    id: partial.id ?? `${idPrefix}-${String(counter).padStart(3, "0")}`,
  };
}
