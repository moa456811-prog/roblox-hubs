// Keep legacy.ts and session-verifier.js so current Cloudflare sessions survive rollback.
import { legacyHandler } from './legacy.ts';
Deno.serve(legacyHandler);
