import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(projectRoot, "src");
const distRoot = path.join(projectRoot, "dist");

const entryFile = path.join(srcRoot, "index.js");

const visited = new Set();
const orderedFiles = [];

visit(entryFile);

const banner = `/* PowerFlow Bar - generated file. Do not edit directly. */\n`;
const body = orderedFiles.map((file) => transformFile(file)).join("\n\n");
const output = `${banner}${body}\n`;

fs.mkdirSync(distRoot, { recursive: true });
fs.writeFileSync(path.join(distRoot, "powerflow_bar.js"), output, "utf8");

console.log(`Built dist/powerflow_bar.js from ${orderedFiles.length} source files.`);

function visit(file) {
  const resolved = resolveFile(file);
  if (visited.has(resolved)) {
    return;
  }
  visited.add(resolved);

  const content = fs.readFileSync(resolved, "utf8");
  const imports = findImports(content);
  for (const specifier of imports) {
    if (!specifier.startsWith(".")) {
      throw new Error(`Only relative imports are supported in this build: ${specifier}`);
    }
    visit(path.resolve(path.dirname(resolved), specifier));
  }
  orderedFiles.push(resolved);
}

function resolveFile(file) {
  if (fs.existsSync(file)) {
    return file;
  }
  if (fs.existsSync(`${file}.js`)) {
    return `${file}.js`;
  }
  throw new Error(`Cannot resolve file: ${file}`);
}

function findImports(content) {
  const result = [];
  const regex = /^\s*import\s+[^'"]*['"]([^'"]+)['"]\s*;?\s*$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    result.push(match[1]);
  }
  return result;
}

function transformFile(file) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/^\s*import\s+[^;]+;?\s*$/gm, "");
  content = content.replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, "");
  content = content.replace(/\bexport\s+(?=(class|function|const|let|var)\b)/g, "");

  const rel = path.relative(projectRoot, file);
  return `/* ${rel} */\n${content.trim()}`;
}
