import fs from "node:fs";
import { execFileSync } from "node:child_process";

const encoded = [1, 2, 3, 4]
  .map((index) => fs.readFileSync(`bundle.part${index}`, "utf8").trim())
  .join("");

const archive = "bundle.tar.gz";
fs.writeFileSync(archive, Buffer.from(encoded, "base64"));
execFileSync("tar", ["-xzf", archive, "-C", "."], { stdio: "inherit" });
fs.rmSync(archive, { force: true });
