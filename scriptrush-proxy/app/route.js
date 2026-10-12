export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#07111f" />
  <meta name="description" content="Create your own Roblox script for any game, scan the live game, and repair the current script." />
  <title>ScriptRush — Create Your Own Roblox Script</title>
  <link rel="stylesheet" href="/styles.css" />
  <style>
    .intro h1{font-size:0!important;line-height:1!important}
    .intro h1::before{content:"Create your own Roblox script for any game.";display:block;font-size:clamp(40px,6vw,70px);line-height:.98;letter-spacing:-.062em;color:#f5f8ff}
    .intro p{font-size:0!important}
    .intro p::before{content:"Choose a Roblox game, describe what you want, and get one complete Luau script ready to paste into your executor. ScriptRush can also scan the live game and fix your current script.";display:block;font-size:14px;line-height:1.65;color:#9bb0ca}
    @media(max-width:520px){.intro h1::before{font-size:39px}.intro p::before{font-size:12px}}
  </style>
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
      "x-scriptrush-ui": "clear-promise-v3",
    },
  });
}
