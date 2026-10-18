#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BANNED_HEURISTIC_IDENTIFIERS = new Set([
  "GUARD_PHRASES",
  "TRIGGER_PREFIXES",
  "CURL_MUTATIONS",
  "SENDS",
  "RECORDS",
  "CHANGES",
  "READS",
  "STOP_WORDS",
  "detectMemoryType",
  "extractAlphanumericTokens",
  "extractQueryTokens",
  "extractSignificantTokens",
  "computeTokenJaccard",
  "tokenizeQueryWords",
]);

function walkTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

export function lintSourceCode(sourceText, filePath = "inline.ts") {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];

  function report(node, message) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      filePath,
      line: line + 1,
      column: character + 1,
      message,
    });
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      report(
        node,
        `Regular expression literal (${node.getText(sourceFile)}) is prohibited. Use deterministic structural parsing or explicit typed schemas instead.`,
      );
    } else if (
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RegExp"
    ) {
      report(
        node,
        "RegExp constructor is prohibited. Use deterministic structural parsing or explicit typed schemas instead.",
      );
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "charCodeAt"
    ) {
      report(
        node,
        "Character-code loop heuristics (charCodeAt) are prohibited. Use structured fields or semantic AI evaluation instead.",
      );
    } else if (
      (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      BANNED_HEURISTIC_IDENTIFIERS.has(node.name.text)
    ) {
      report(
        node,
        `Hardcoded heuristic table or classifier '${node.name.text}' is prohibited. Use structured fields or semantic evaluation instead.`,
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function lintAllSources(rootDir = ROOT) {
  const targets = [join(rootDir, "cli", "src"), join(rootDir, "sdks", "node", "src")];
  const allViolations = [];

  for (const target of targets) {
    for (const file of walkTsFiles(target)) {
      const content = readFileSync(file, "utf8");
      const rel = relative(rootDir, file);
      allViolations.push(...lintSourceCode(content, rel));
    }
  }

  return allViolations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = lintAllSources(ROOT);
  if (violations.length > 0) {
    console.error("lint-no-heuristics: prohibited regex or heuristic constructs detected:");
    for (const v of violations) {
      console.error(`  ${v.filePath}:${v.line}:${v.column} - ${v.message}`);
    }
    process.exit(1);
  }
}
