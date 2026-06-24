export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: "critical" | "high" | "medium";
  description: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "AWS Access Key",
    pattern: /(AKIA|AGPA|AIDA|AROA)[A-Z0-9]{16}/,
    severity: "critical",
    description: "AWS IAM access key ID",
  },
  {
    name: "AWS Secret Key",
    pattern: /(?:aws_secret_access_key|aws_secret)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/i,
    severity: "critical",
    description: "AWS secret access key",
  },
  {
    name: "GitHub Token (ghp/ghs)",
    pattern: /gh[ps]_[A-Za-z0-9_]{36,}/,
    severity: "critical",
    description: "GitHub personal access or server token",
  },
  {
    name: "GitHub OAuth Token",
    pattern: /gho_[A-Za-z0-9_]{36,}/,
    severity: "high",
    description: "GitHub OAuth access token",
  },
  {
    name: "Slack Token",
    pattern: /xox[bporas]-[0-9]{10,13}-[0-9a-zA-Z]{10,48}/,
    severity: "critical",
    description: "Slack bot, user, or app token",
  },
  {
    name: "Stripe Live Key",
    pattern: /sk_live_[0-9a-zA-Z]{24,99}/,
    severity: "critical",
    description: "Stripe live secret key",
  },
  {
    name: "Stripe Publishable Key",
    pattern: /pk_live_[0-9a-zA-Z]{24,99}/,
    severity: "medium",
    description: "Stripe publishable key (lower risk but still sensitive)",
  },
  {
    name: "Google API Key",
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    severity: "high",
    description: "Google API key",
  },
  {
    name: "SendGrid API Key",
    pattern: /SG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}/,
    severity: "critical",
    description: "SendGrid API key",
  },
  {
    name: "Twilio API Key",
    pattern: /SK[a-f0-9]{32}/,
    severity: "high",
    description: "Twilio API key SID",
  },
  {
    name: "Private Key Header",
    pattern: /-----BEGIN\s+(RSA|DSA|EC|PGP|OPENSSH)\s+PRIVATE\s+KEY-----/,
    severity: "critical",
    description: "Private key material",
  },
  {
    name: "JWT Token",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    severity: "medium",
    description: "JSON Web Token (may contain sensitive claims)",
  },
  {
    name: "NPM Token",
    pattern: /npm_[A-Za-z0-9]{36}/,
    severity: "critical",
    description: "npm publish token",
  },
  {
    name: "Anthropic API Key",
    pattern: /sk-ant-[A-Za-z0-9_-]{40,}/,
    severity: "critical",
    description: "Anthropic Claude API key",
  },
  {
    name: "OpenAI API Key",
    pattern: /sk-[A-Za-z0-9]{48,}/,
    severity: "critical",
    description: "OpenAI API key",
  },
  {
    name: "Database URL",
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/i,
    severity: "critical",
    description: "Database connection string with embedded credentials",
  },
  {
    name: "Generic Password Assignment",
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/i,
    severity: "high",
    description: "Hardcoded password in variable assignment",
  },
  {
    name: "Generic API Key Assignment",
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
    severity: "high",
    description: "Hardcoded API key in variable assignment",
  },
  {
    name: "Mailgun API Key",
    pattern: /key-[0-9a-zA-Z]{32}/,
    severity: "high",
    description: "Mailgun API key",
  },
  {
    name: "Heroku API Key",
    pattern: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    severity: "medium",
    description: "Possible Heroku API key or UUID with secrets context",
  },
  {
    name: "Generic Token Assignment",
    pattern: /(?:token|secret|credential)\s*[=:]\s*['"][A-Za-z0-9_\-.]{20,}['"]/i,
    severity: "medium",
    description: "Hardcoded token or secret in variable assignment",
  },
];
