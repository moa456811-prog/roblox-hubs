import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const parts = [
  "source.0.b64",
  "source.1.b64",
  "source.2.b64",
  "source.3.b64",
  "source.4.b64",
  "source.5a0.b64",
  "source.5a1.b64",
  "source.5b.b64",
  "source.6.b64",
];

const encoded = parts
  .map((name) => readFileSync(join(root, name), "utf8").trim())
  .join("");

const archive = join(root, "source.tgz");
writeFileSync(archive, Buffer.from(encoded, "base64"));
execFileSync("tar", ["-xzf", archive, "-C", root], { stdio: "inherit" });
unlinkSync(archive);
