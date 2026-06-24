import { Node, SyntaxKind, type SourceFile, type CallExpression } from "ts-morph";
import { getCallName, getQualifiedCallName, containsUserInput, getLocation } from "./ast-engine.js";

export interface TaintFlow {
  source: string;       // The parameter/input name
  sink: string;         // The dangerous function call
  file: string;
  line: number;
  column: number;
  evidence: string;     // The code snippet
}

// Check if any argument to a call expression contains tainted data
export function isCallTainted(call: CallExpression): boolean {
  const args = call.getArguments();
  return args.some(arg => containsUserInput(arg));
}

// Get a human-readable evidence string for a call
export function getCallEvidence(call: CallExpression): string {
  const text = call.getText();
  // Truncate very long call expressions
  return text.length > 200 ? text.substring(0, 200) + "..." : text;
}

// Find all function declarations that look like MCP tool handlers
export function findToolHandlers(sourceFile: SourceFile): Node[] {
  const handlers: Node[] = [];

  // Look for: async execute(args, ...) { ... }
  const methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
  for (const m of methods) {
    const name = m.getName();
    if (name === "execute" || name === "handler" || name === "run") {
      handlers.push(m);
    }
  }

  // Look for: execute: async (args) => { ... }
  // These are property assignments in object literals
  const propAssignments = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment);
  for (const pa of propAssignments) {
    const name = pa.getName();
    if (name === "execute" || name === "handler" || name === "run") {
      handlers.push(pa);
    }
  }

  // Also look for async functions that take (args, ctx) pattern
  const funcs = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
  for (const f of funcs) {
    const params = f.getParameters();
    if (params.some(p => p.getName() === "args" || p.getName() === "ctx")) {
      handlers.push(f);
    }
  }

  const arrowFuncs = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
  for (const f of arrowFuncs) {
    const params = f.getParameters();
    if (params.some(p => p.getName() === "args")) {
      handlers.push(f);
    }
  }

  return handlers;
}

// Check if a node is inside a try-catch block
export function isInsideTryCatch(node: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (current.getKind() === SyntaxKind.TryStatement) return true;
    current = current.getParent();
  }
  return false;
}

// Check if a catch clause is empty (swallows errors)
export function isEmptyCatch(node: Node): boolean {
  if (node.getKind() !== SyntaxKind.CatchClause) return false;
  const block = node.getChildrenOfKind(SyntaxKind.Block)[0];
  if (!block) return true;
  return block.getStatements().length === 0;
}
