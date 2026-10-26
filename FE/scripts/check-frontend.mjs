import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import ts from "typescript";

const root = process.cwd();
const source = resolve(root, "src");
const config = ts.readConfigFile(resolve(root, "tsconfig.app.json"), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
const files = walk(source).filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".d.ts"));
const allEdges = new Map();
const runtimeEdges = new Map();
const packages = new Set();
for (const file of files) {
  const all = new Set(); const runtime = new Set();
  const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier; let typeOnly = false; let dynamic = false;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
      typeOnly = ts.isImportDeclaration(node) ? !!node.importClause?.isTypeOnly : node.isTypeOnly;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      specifier = node.arguments[0].text; dynamic = true;
    }
    if (specifier) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) packages.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
      else {
        const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName;
        if (target && resolve(target).startsWith(source + sep)) {
          all.add(resolve(target));
          if (!typeOnly && !dynamic) runtime.add(resolve(target));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); allEdges.set(file, all); runtimeEdges.set(file, runtime);
}

function reachable(graph, first, seen = new Set()) {
  if (seen.has(first)) return seen;
  seen.add(first);
  for (const next of graph.get(first) ?? []) reachable(graph, next, seen);
  return seen;
}
function assertAcyclic(graph) {
  const done = new Set(); const active = new Set();
  function visit(node) {
    assert(!active.has(node), `Circular runtime import: ${relative(root, node)}`);
    if (done.has(node)) return;
    active.add(node);
    for (const next of graph.get(node) ?? []) visit(next);
    active.delete(node); done.add(node);
  }
  for (const node of graph.keys()) visit(node);
}
const used = reachable(allEdges, resolve(source, "main.tsx"));
assert(used.has(resolve(source, "App.tsx")), "Missing application entry");
const unused = files.filter((file) => !used.has(file)).map((file) => relative(root, file));
assert.deepEqual(unused, [], "Unreachable application modules");
assertAcyclic(runtimeEdges);
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const name of packages) assert(pkg.dependencies[name], `Undeclared application dependency: ${name}`);

const dist = resolve(root, "dist");
const manifest = JSON.parse(readFileSync(resolve(dist, ".vite/manifest.json"), "utf8"));
const chunks = new Map(Object.entries(manifest).map(([key, value]) => [key, new Set(value.imports ?? [])]));
assertAcyclic(chunks);
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
assert(entry, "No build entry in the Vite manifest");
const initial = reachable(chunks, entry);
for (const module of ["src/pages/Board.tsx", "src/features/cards/CardDialogBody.tsx"]) {
  assert(manifest[module], `Missing lazy module: ${module}`);
  assert(!initial.has(module), `Private module eagerly loaded: ${module}`);
}
const javascript = Object.values(manifest).filter((chunk) => chunk.file.endsWith(".js")).map((chunk) => readFileSync(resolve(dist, chunk.file)));
const firstLoad = [...initial].map((key) => readFileSync(resolve(dist, manifest[key].file)));
const largest = Math.max(...javascript.map((file) => file.byteLength));
assert(largest <= 500_000, `JavaScript chunk exceeds 500 kB: ${largest}`);
const result = {
  applicationModules: files.length, unusedModules: unused, runtimeCycles: 0,
  bundle: { chunks: javascript.length, largestBytes: largest, initialJSBytes: firstLoad.reduce((sum, file) => sum + file.byteLength, 0), initialGzipBytes: firstLoad.reduce((sum, file) => sum + gzipSync(file).byteLength, 0), totalJSBytes: javascript.reduce((sum, file) => sum + file.byteLength, 0) },
};
mkdirSync(resolve(root, "node_modules/.tmp"), { recursive: true });
writeFileSync(resolve(root, "node_modules/.tmp/frontend-check.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
