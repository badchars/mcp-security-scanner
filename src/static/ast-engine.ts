import { Project, SourceFile, SyntaxKind, Node, CallExpression, StringLiteral, TemplateExpression, Identifier, PropertyAccessExpression } from "ts-morph";
import { resolve } from "node:path";

export interface AstProject {
  project: Project;
  sourceFiles: SourceFile[];
  rootDir: string;
}

export function initProject(path: string, tsconfigPath?: string): AstProject {
  const rootDir = resolve(path);
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      target: 99, // ESNext
      module: 99, // ESNext
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Discover and add source files
  const globs = [
    `${rootDir}/**/*.ts`,
    `${rootDir}/**/*.js`,
    `${rootDir}/**/*.mts`,
    `${rootDir}/**/*.mjs`,
  ];

  const excludeGlobs = [
    `${rootDir}/node_modules/**`,
    `${rootDir}/dist/**`,
    `${rootDir}/.git/**`,
    `${rootDir}/**/*.d.ts`,
  ];

  project.addSourceFilesAtPaths(globs);

  // Remove excluded files
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (excludeGlobs.some(g => {
      const base = g.replace("/**", "");
      return fp.includes(base.replace(`${rootDir}/`, ""));
    })) {
      // Simplistic: check if path contains node_modules, dist, .git, or ends with .d.ts
    }
  }

  const sourceFiles = project.getSourceFiles().filter(sf => {
    const fp = sf.getFilePath();
    return !fp.includes("/node_modules/") &&
           !fp.includes("/dist/") &&
           !fp.includes("/.git/") &&
           !fp.endsWith(".d.ts");
  });

  return { project, sourceFiles, rootDir };
}

// Helper: find all call expressions in a source file
export function findCallExpressions(sourceFile: SourceFile): CallExpression[] {
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
}

// Helper: get the function/method name from a call expression
export function getCallName(call: CallExpression): string {
  const expr = call.getExpression();

  // Simple call: exec(...)
  if (Node.isIdentifier(expr)) {
    return expr.getText();
  }

  // Property access: child_process.exec(...), fs.readFile(...)
  if (Node.isPropertyAccessExpression(expr)) {
    return expr.getName();
  }

  return expr.getText();
}

// Helper: get the full qualified call name like "child_process.exec" or "fs.readFile"
export function getQualifiedCallName(call: CallExpression): string {
  const expr = call.getExpression();

  if (Node.isPropertyAccessExpression(expr)) {
    const obj = expr.getExpression();
    if (Node.isIdentifier(obj)) {
      return `${obj.getText()}.${expr.getName()}`;
    }
  }

  if (Node.isIdentifier(expr)) {
    return expr.getText();
  }

  return expr.getText();
}

// Helper: check if an expression contains user input (function params, args.*, etc)
export function containsUserInput(node: Node): boolean {
  const text = node.getText();

  // Check for common user input patterns
  const userInputPatterns = [
    /\bargs\b/,           // MCP tool args
    /\breq\.query\b/,     // Express query
    /\breq\.params\b/,    // Express params
    /\breq\.body\b/,      // Express body
    /\breq\.headers\b/,   // Express headers
    /\bparams\b/,         // Generic params
    /\binput\b/,          // Generic input
    /\buserInput\b/,      // Generic userInput
  ];

  if (userInputPatterns.some(p => p.test(text))) return true;

  // Check for template literals with interpolations
  if (node.getKind() === SyntaxKind.TemplateExpression) return true;

  // Check for identifiers that trace to function parameters
  const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const id of identifiers) {
    const name = id.getText();
    if (["args", "params", "input", "query", "body", "userInput", "data", "payload"].includes(name)) {
      return true;
    }
  }

  return false;
}

// Helper: get location info
export function getLocation(node: Node): { file: string; line: number; column: number } {
  const sf = node.getSourceFile();
  const start = node.getStart();
  const { line, column } = sf.getLineAndColumnAtPos(start);
  return {
    file: sf.getFilePath(),
    line,
    column,
  };
}

// Helper: get all string literals in a file
export function findStringLiterals(sourceFile: SourceFile): StringLiteral[] {
  return sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
}

// Helper: get all template expressions (template literals with interpolation)
export function findTemplateExpressions(sourceFile: SourceFile): Node[] {
  return [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.TemplateExpression),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  ];
}

// Helper: check if a call has shell:true in options
export function hasShellTrue(call: CallExpression): boolean {
  const args = call.getArguments();
  for (const arg of args) {
    const text = arg.getText();
    if (/shell\s*:\s*true/.test(text)) return true;
  }
  return false;
}

// Helper: find new RegExp() calls
export function findNewRegExpCalls(sourceFile: SourceFile): Node[] {
  const results: Node[] = [];

  // new RegExp(...)
  const newExprs = sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression);
  for (const expr of newExprs) {
    if (expr.getExpression().getText() === "RegExp") {
      results.push(expr);
    }
  }

  return results;
}

export { SyntaxKind, Node, type SourceFile, type CallExpression };
