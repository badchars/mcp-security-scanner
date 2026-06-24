export interface PoisoningPattern {
  name: string;
  pattern: RegExp;
  severity: "critical" | "high" | "medium";
  category: string;
  description: string;
}

export const POISONING_PATTERNS: PoisoningPattern[] = [
  // File read / credential harvesting
  {
    name: "File Read Instruction",
    pattern: /(?:read|cat|open|access|get|fetch|load|include)\s+.*(?:\/etc\/|~\/\.ssh|\.env|credentials|\.aws|\.kube|id_rsa|known_hosts|\.gnupg)/i,
    severity: "critical",
    category: "credential_harvesting",
    description: "Instructs LLM to read sensitive files",
  },
  {
    name: "Home Directory Access",
    pattern: /(?:read|access|open)\s+.*(?:home\s+directory|user\s+folder|~\/)/i,
    severity: "high",
    category: "credential_harvesting",
    description: "Instructs LLM to access home directory contents",
  },
  // Data exfiltration
  {
    name: "Data Exfiltration",
    pattern: /(?:send|post|upload|transmit|forward|exfiltrate)\s+.*(?:content|data|file|secret|token|key|credential|result)/i,
    severity: "critical",
    category: "exfiltration",
    description: "Instructs LLM to transmit data externally",
  },
  {
    name: "URL Parameter Injection",
    pattern: /(?:include|append|add|insert|embed)\s+.*(?:parameter|query|url|request|header)/i,
    severity: "high",
    category: "exfiltration",
    description: "Instructs LLM to inject data into outbound requests",
  },
  // Instruction override
  {
    name: "Instruction Override",
    pattern: /ignore\s+(?:previous|above|all|prior|earlier)\s+(?:instructions|rules|guidelines|prompts)/i,
    severity: "critical",
    category: "instruction_override",
    description: "Attempts to override previous LLM instructions",
  },
  {
    name: "Role Assumption",
    pattern: /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|switch\s+to|assume\s+the\s+role)/i,
    severity: "high",
    category: "instruction_override",
    description: "Attempts to change LLM persona or role",
  },
  // System prompt extraction
  {
    name: "System Prompt Extraction",
    pattern: /(?:system\s+prompt|repeat\s+.*instructions|what\s+.*instructions|show\s+.*prompt|reveal\s+.*rules)/i,
    severity: "high",
    category: "prompt_extraction",
    description: "Attempts to extract system prompt or instructions",
  },
  // Social engineering
  {
    name: "Secrecy Instruction",
    pattern: /(?:do\s+not\s+tell|don'?t\s+inform|keep\s+.*secret|hide\s+.*from|don'?t\s+mention|never\s+reveal)/i,
    severity: "critical",
    category: "social_engineering",
    description: "Instructs LLM to hide actions from user",
  },
  {
    name: "Urgency Manipulation",
    pattern: /(?:immediately|urgent|critical|must\s+do\s+now|without\s+delay|right\s+away|do\s+not\s+wait)/i,
    severity: "medium",
    category: "social_engineering",
    description: "Uses urgency to bypass careful evaluation",
  },
  // Cross-origin tool manipulation
  {
    name: "Cross-Origin Tool Reference",
    pattern: /(?:when\s+using|before\s+calling|after\s+calling|always\s+.*with\s+the)\s+.*(?:tool|function|command)/i,
    severity: "high",
    category: "cross_origin",
    description: "References tools from other MCP servers",
  },
  {
    name: "Cross-Server Instruction",
    pattern: /(?:tell\s+the\s+other|pass\s+to|forward\s+to|use\s+the\s+.*server|call\s+the\s+.*server)/i,
    severity: "high",
    category: "cross_origin",
    description: "Instructs cross-server communication",
  },
  // Privilege escalation
  {
    name: "Privilege Escalation",
    pattern: /(?:admin|root|sudo|elevated|unrestricted|full\s+access|bypass\s+.*check|skip\s+.*validation)/i,
    severity: "high",
    category: "privilege_escalation",
    description: "Requests elevated privileges or validation bypass",
  },
  // Credential harvesting via parameters
  {
    name: "Parameter Credential Request",
    pattern: /(?:password|api.?key|token|secret|credential|auth)\s+.*(?:parameter|field|input|argument)/i,
    severity: "high",
    category: "credential_harvesting",
    description: "Tool schema requests credential-like parameters",
  },
  // Encoded payloads
  {
    name: "Base64 Encoded Instruction",
    pattern: /(?:decode|base64|atob)\s*\(/i,
    severity: "medium",
    category: "obfuscation",
    description: "Contains encoded content that may hide instructions",
  },
  // Markdown/HTML injection in descriptions
  {
    name: "Markdown Image Exfiltration",
    pattern: /!\[.*?\]\(https?:\/\/.*?\)/,
    severity: "high",
    category: "exfiltration",
    description: "Markdown image tag that could exfiltrate data via URL parameters",
  },
];

// ANSI escape sequence patterns
export const ANSI_PATTERNS: RegExp[] = [
  /\x1b\[/,           // CSI (Control Sequence Introducer)
  /\x1b\[/,            // Octal CSI (using hex equivalent)
  /\\u001b\[/,         // Unicode CSI (literal string)
  /\\x1b\[/,           // Hex CSI (literal string)
  /\x1b\]/,            // OSC (Operating System Command)
  /\x1b[PX^_]/,        // DCS, SOS, PM, APC
  /[\x00-\x08\x0e-\x1f]/,  // C0 control codes (except tab, newline, carriage return)
];

// Unicode steganography patterns
export const UNICODE_STEGO_PATTERNS: { name: string; pattern: RegExp; description: string }[] = [
  { name: "Zero-Width Space", pattern: /\u200B/, description: "U+200B ZERO WIDTH SPACE" },
  { name: "Zero-Width Non-Joiner", pattern: /\u200C/, description: "U+200C ZERO WIDTH NON-JOINER" },
  { name: "Zero-Width Joiner", pattern: /\u200D/, description: "U+200D ZERO WIDTH JOINER" },
  { name: "Word Joiner", pattern: /\u2060/, description: "U+2060 WORD JOINER" },
  { name: "Zero-Width No-Break Space", pattern: /\uFEFF/, description: "U+FEFF BOM / ZERO WIDTH NO-BREAK SPACE" },
  { name: "LTR Mark", pattern: /\u200E/, description: "U+200E LEFT-TO-RIGHT MARK" },
  { name: "RTL Mark", pattern: /\u200F/, description: "U+200F RIGHT-TO-LEFT MARK" },
  { name: "LTR Embedding", pattern: /\u202A/, description: "U+202A LEFT-TO-RIGHT EMBEDDING" },
  { name: "RTL Embedding", pattern: /\u202B/, description: "U+202B RIGHT-TO-LEFT EMBEDDING" },
  { name: "LTR Override", pattern: /\u202D/, description: "U+202D LEFT-TO-RIGHT OVERRIDE" },
  { name: "RTL Override", pattern: /\u202E/, description: "U+202E RIGHT-TO-LEFT OVERRIDE" },
  { name: "Invisible Separator", pattern: /\u2063/, description: "U+2063 INVISIBLE SEPARATOR" },
  { name: "Invisible Plus", pattern: /\u2064/, description: "U+2064 INVISIBLE PLUS" },
  { name: "Soft Hyphen", pattern: /\u00AD/, description: "U+00AD SOFT HYPHEN" },
  { name: "Mongolian Vowel Separator", pattern: /\u180E/, description: "U+180E MONGOLIAN VOWEL SEPARATOR" },
];
