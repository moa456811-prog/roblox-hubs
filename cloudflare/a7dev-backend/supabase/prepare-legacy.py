"""Wrap a privately exported original backend; never commit its output."""
import argparse
from pathlib import Path
import json

parser = argparse.ArgumentParser()
parser.add_argument('original', type=Path)
parser.add_argument('public_key', help='Base64url Ed25519 PUBLIC key; never a private key')
parser.add_argument('output', type=Path)
args = parser.parse_args()
s = args.original.read_text()
marker = 'async function verifySignedSession(token: string, userId: number) {'
handler = 'Deno.serve(async (req: Request) => {'
assert s.count(marker) == 1 and s.count(handler) == 1 and s.rstrip().endswith('});')
s = 'import { verifyCloudflareSession } from "./session-verifier.js";\nconst CLOUDFLARE_SESSION_PUBLIC_KEY = ' + json.dumps(args.public_key) + ';\n' + s
s = s.replace(marker, marker + '\n  if (token.startsWith("a7cf1.")) return verifyCloudflareSession(token, userId, CLOUDFLARE_SESSION_PUBLIC_KEY);')
s = s.replace(handler, 'export async function legacyHandler(req: Request) {')
s = s.rstrip()[:-3] + '}\n'
args.output.write_text(s)
args.output.chmod(0o600)
