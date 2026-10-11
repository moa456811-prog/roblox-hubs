import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const encoded = readFileSync(new URL("./source.b64", import.meta.url), "utf8").trim();
const archive = new URL("./source.tgz", import.meta.url);
writeFileSync(archive, Buffer.from(encoded, "base64"));
execFileSync("tar", ["-xzf", archive.pathname, "-C", new URL(".", import.meta.url).pathname], { stdio: "inherit" });
unlinkSync(archive);
