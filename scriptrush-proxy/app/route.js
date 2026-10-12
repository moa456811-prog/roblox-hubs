export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#07111f" />
  <meta name="description" content="Generate, scan and repair one executor-ready Roblox Luau script for a selected game." />
  <title>ScriptRush — Roblox Script Builder</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div id="app"></div>
  <script src="/app.js" defer></script>
</body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-scriptrush-ui": "clear-onboarding-v2",
    },
  });
}
