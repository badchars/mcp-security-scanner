export interface DangerousSink {
  name: string;
  module: string;
  severity: "critical" | "high" | "medium";
  category: string;
  description: string;
}

export const COMMAND_INJECTION_SINKS: DangerousSink[] = [
  { name: "exec", module: "child_process", severity: "critical", category: "command_injection", description: "Executes shell command with full shell interpolation" },
  { name: "execSync", module: "child_process", severity: "critical", category: "command_injection", description: "Synchronous shell execution" },
  { name: "spawn", module: "child_process", severity: "high", category: "command_injection", description: "Spawns process (dangerous with shell:true)" },
  { name: "spawnSync", module: "child_process", severity: "high", category: "command_injection", description: "Synchronous spawn (dangerous with shell:true)" },
  { name: "execFile", module: "child_process", severity: "medium", category: "command_injection", description: "Executes file (safer but still risky with user input)" },
  { name: "execFileSync", module: "child_process", severity: "medium", category: "command_injection", description: "Synchronous file execution" },
  { name: "fork", module: "child_process", severity: "high", category: "command_injection", description: "Forks new Node.js process" },
];

export const CODE_EXECUTION_SINKS: DangerousSink[] = [
  { name: "eval", module: "global", severity: "critical", category: "code_execution", description: "Evaluates arbitrary JavaScript" },
  { name: "Function", module: "global", severity: "critical", category: "code_execution", description: "Creates function from string (eval equivalent)" },
  { name: "runInNewContext", module: "vm", severity: "critical", category: "code_execution", description: "Executes code in new V8 context" },
  { name: "runInThisContext", module: "vm", severity: "critical", category: "code_execution", description: "Executes code in current V8 context" },
  { name: "compileFunction", module: "vm", severity: "critical", category: "code_execution", description: "Compiles function from string" },
  { name: "Script", module: "vm", severity: "critical", category: "code_execution", description: "Creates compiled script from string" },
];

export const SSRF_SINKS: DangerousSink[] = [
  { name: "fetch", module: "global", severity: "high", category: "ssrf", description: "HTTP fetch with user-controlled URL" },
  { name: "get", module: "axios", severity: "high", category: "ssrf", description: "Axios GET request" },
  { name: "post", module: "axios", severity: "high", category: "ssrf", description: "Axios POST request" },
  { name: "request", module: "http", severity: "high", category: "ssrf", description: "Node.js HTTP request" },
  { name: "request", module: "https", severity: "high", category: "ssrf", description: "Node.js HTTPS request" },
];

export const PATH_TRAVERSAL_SINKS: DangerousSink[] = [
  { name: "readFile", module: "fs", severity: "high", category: "path_traversal", description: "Read file with user-controlled path" },
  { name: "readFileSync", module: "fs", severity: "high", category: "path_traversal", description: "Synchronous file read" },
  { name: "writeFile", module: "fs", severity: "critical", category: "path_traversal", description: "Write file with user-controlled path" },
  { name: "writeFileSync", module: "fs", severity: "critical", category: "path_traversal", description: "Synchronous file write" },
  { name: "readdir", module: "fs", severity: "medium", category: "path_traversal", description: "List directory with user-controlled path" },
  { name: "readdirSync", module: "fs", severity: "medium", category: "path_traversal", description: "Synchronous directory listing" },
  { name: "stat", module: "fs", severity: "medium", category: "path_traversal", description: "File stat with user-controlled path" },
  { name: "access", module: "fs", severity: "medium", category: "path_traversal", description: "File access check" },
  { name: "unlink", module: "fs", severity: "critical", category: "path_traversal", description: "Delete file with user-controlled path" },
  { name: "unlinkSync", module: "fs", severity: "critical", category: "path_traversal", description: "Synchronous file deletion" },
  { name: "mkdir", module: "fs", severity: "medium", category: "path_traversal", description: "Create directory with user-controlled path" },
  { name: "rmdir", module: "fs", severity: "high", category: "path_traversal", description: "Remove directory with user-controlled path" },
  { name: "rm", module: "fs", severity: "critical", category: "path_traversal", description: "Recursive file/directory removal" },
];

export const CRYPTO_WEAK_SINKS: DangerousSink[] = [
  { name: "createHash('md5')", module: "crypto", severity: "medium", category: "weak_crypto", description: "MD5 hash (broken for security use)" },
  { name: "createHash('sha1')", module: "crypto", severity: "medium", category: "weak_crypto", description: "SHA-1 hash (deprecated for security use)" },
  { name: "Math.random()", module: "global", severity: "high", category: "weak_crypto", description: "Non-cryptographic PRNG used for security" },
];
