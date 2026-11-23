#!/usr/bin/env node
// Übernimmt die Kalkulations-Engine (units, layout-core, resources) unverändert aus dem
// kalpri-Repo nach lib/kalpri/<paket>/ und schreibt lib/kalpri/HERKUNFT.json.
// Optional: --werkbank baut die Werkbank (Patch aus lib/kalpri/werkbank.patch) in einem
// temporären Ordner und legt das Ergebnis unter vendor/kalpri-werkbank/ ab.
//
// Aufruf: node scripts/kalpri-sync.mjs <pfad-zum-kalpri-repo> [--werkbank]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const mitWerkbank = argv.includes("--werkbank");
const quelle = argv.find((a) => !a.startsWith("--"));
if (!quelle) {
  console.error("Aufruf: node scripts/kalpri-sync.mjs <pfad-zum-kalpri-repo> [--werkbank]");
  process.exit(1);
}
const repo = path.resolve(quelle);
const PAKETE = ["units", "layout-core", "resources"];
for (const p of PAKETE) {
  if (!fs.existsSync(path.join(repo, "packages", p, "src"))) {
    console.error(`Kein kalpri-Repo: packages/${p}/src fehlt in ${repo}`);
    process.exit(1);
  }
}

const git = (args, cwd = repo) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const ziel = path.join(appDir, "lib", "kalpri");
fs.mkdirSync(ziel, { recursive: true });
for (const p of PAKETE) {
  const z = path.join(ziel, p);
  fs.rmSync(z, { recursive: true, force: true });
  fs.cpSync(path.join(repo, "packages", p, "src"), z, { recursive: true });
}

let hash = "unbekannt";
let sauber = false;
try {
  hash = git(["rev-parse", "HEAD"]);
  sauber = git(["status", "--porcelain", "--", "packages", "apps"]) === "";
} catch {
  /* kein git-Repo */
}
fs.writeFileSync(
  path.join(ziel, "HERKUNFT.json"),
  JSON.stringify(
    {
      repo: "kalpri",
      commit: hash,
      saubererStand: sauber,
      pakete: PAKETE,
      datum: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Engine übernommen (${hash.slice(0, 10)}${sauber ? "" : ", ungespeicherte Änderungen im Quellrepo"}).`);

if (mitWerkbank) {
  const patch = path.join(ziel, "werkbank.patch");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kalpri-werkbank-"));
  try {
    // Arbeitskopie ohne node_modules/.git
    fs.cpSync(repo, tmp, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|\.git|dist)([\\/]|$)/.test(src),
    });
    if (fs.existsSync(patch)) {
      execFileSync("git", ["apply", "--whitespace=nowarn", patch], { cwd: tmp, stdio: "inherit" });
    }
    const run = (cmd, args) => execFileSync(cmd, args, { cwd: tmp, stdio: "inherit" });
    run("pnpm", ["install", "--frozen-lockfile"]);
    run("pnpm", ["--filter", "werkbank", "exec", "vite", "build"]);
    const dist = path.join(tmp, "apps", "werkbank", "dist");
    const out = path.join(appDir, "vendor", "kalpri-werkbank");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.cpSync(dist, out, { recursive: true });
    console.log("Werkbank gebaut nach vendor/kalpri-werkbank/");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
