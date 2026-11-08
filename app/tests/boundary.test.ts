import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_ONLY_PATTERNS = [
  "@/lib/db",
  "@/lib/storage",
  "@/lib/mail",
  "@/lib/mailBrevo",
  "@/lib/mailTransport",
  "@/lib/mistral",
  "@/lib/requests",
  "@/lib/identities",
  "@/lib/links",
  "@/lib/analysis",
  "@/lib/approval",
  "@/lib/assistant",
  "@/lib/history",
  "@/lib/audit",
  "@/lib/auth",
  "pg",
  "nodemailer",
  "@aws-sdk/",
  "@mistralai/",
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Design §8 boundary: "use client" components may only reach the backend
 * through app/api Route Handlers — never via server-only modules.
 */
describe("server/client module boundary", () => {
  it("no client component imports server-only modules", () => {
    const root = path.join(__dirname, "..", "app");
    const violations: string[] = [];
    for (const file of walk(root)) {
      const content = fs.readFileSync(file, "utf8");
      if (!content.includes('"use client"') && !content.includes("'use client'")) continue;
      for (const pattern of SERVER_ONLY_PATTERNS) {
        if (content.includes(pattern)) violations.push(`${file} imports ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
