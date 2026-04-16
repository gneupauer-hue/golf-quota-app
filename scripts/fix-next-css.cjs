const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const cssDir = path.join(projectRoot, ".next", "static", "css");
const targetDir = path.join(cssDir, "app");
const targetFile = path.join(targetDir, "layout.css");

if (!fs.existsSync(cssDir)) {
  process.exit(0);
}

const cssFiles = fs
  .readdirSync(cssDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
  .map((entry) => entry.name);

if (!cssFiles.length) {
  process.exit(0);
}

const sourceFile = path.join(cssDir, cssFiles[0]);
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourceFile, targetFile);
console.log(`Copied ${path.basename(sourceFile)} -> .next/static/css/app/layout.css`);
