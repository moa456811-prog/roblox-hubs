import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const encoded = readFileSync(join(root, "source.b64"), "utf8").trim();
const archive = join(root, "source.tgz");
writeFileSync(archive, Buffer.from(encoded, "base64"));
execFileSync("tar", ["-xzf", archive, "-C", root], { stdio: "inherit" });
unlinkSync(archive);
