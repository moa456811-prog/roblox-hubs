export async function verifyCloudflareSession(token, userId, publicKey) {
  if (typeof token !== "string" || token.length > 4096 || !token.startsWith("a7cf1.")) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const decode = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)), c=>c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", decode(publicKey), "Ed25519", false, ["verify"]);
    if (!await crypto.subtle.verify("Ed25519", key, decode(parts[2]), new TextEncoder().encode("a7cf1."+parts[1]))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (data.v !== 2 || !Number.isSafeInteger(data.uid) || data.uid !== Number(userId) || !Number.isFinite(data.exp) || data.exp <= Math.floor(Date.now()/1000)) return null;
    return data;
  } catch { return null; }
}
