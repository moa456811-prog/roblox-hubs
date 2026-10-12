export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STYLE = `
<style id="scriptrush-layout-fix">
  html, body { min-height: 100%; }
  .sr .composer.docked {
    position: relative !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: min(920px, 100%) !important;
    margin: 28px auto 0 !important;
    z-index: 2 !important;
  }
  .sr .composer.docked::before { display: none !important; }
  .sr .body { padding-bottom: 72px !important; overflow: visible !important; }
  .sr .chat { padding-bottom: 0 !important; overflow: visible !important; }
  .sr .m, .sr .code { overflow: visible !important; }
  .sr .code { width: 100% !important; min-width: 0 !important; position: relative; }
  .sr .code > div { position: sticky !important; top: 0 !important; z-index: 4 !important; background: #0b1829 !important; }
  .sr .code pre {
    display: block !important;
    width: 100% !important;
    max-height: 70vh !important;
    min-height: 420px !important;
    overflow: auto !important;
    white-space: pre !important;
    overscroll-behavior: contain !important;
    scrollbar-gutter: stable both-edges !important;
    padding-bottom: 28px !important;
  }
  .sr .code .sr-expand-code {
    border: 1px solid #4d79ad;
    border-radius: 7px;
    background: #102845;
    color: #e6f1ff;
    padding: 6px 9px;
    font-size: 9px;
    margin-left: 7px;
  }
  .sr .code.sr-code-expanded {
    position: fixed !important;
    inset: 12px !important;
    width: auto !important;
    height: calc(100vh - 24px) !important;
    max-width: none !important;
    z-index: 999999 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    background: #050b13 !important;
    box-shadow: 0 30px 100px rgba(0,0,0,.75) !important;
  }
  .sr .code.sr-code-expanded > div { position: relative !important; flex: 0 0 auto; }
  .sr .code.sr-code-expanded pre {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    max-height: none !important;
    height: auto !important;
  }
  body.sr-code-open { overflow: hidden !important; }
  @media (max-width: 800px) {
    .sr .composer.docked { width: 100% !important; margin-top: 20px !important; }
    .sr .body { padding-bottom: 32px !important; }
    .sr .code pre { min-height: 320px !important; max-height: 68vh !important; }
    .sr .code.sr-code-expanded { inset: 6px !important; height: calc(100vh - 12px) !important; }
  }
</style>`;

const SCRIPT = `
<script id="scriptrush-layout-script">
(() => {
  const enhance = () => {
    document.querySelectorAll('.sr .code').forEach((card) => {
      if (card.dataset.viewerReady === '1') return;
      const header = card.firstElementChild;
      if (!header) return;
      card.dataset.viewerReady = '1';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sr-expand-code';
      button.textContent = 'Expand';
      button.setAttribute('aria-label', 'Expand script viewer');
      button.addEventListener('click', () => {
        const open = card.classList.toggle('sr-code-expanded');
        document.body.classList.toggle('sr-code-open', open);
        button.textContent = open ? 'Close' : 'Expand';
      });
      header.appendChild(button);
    });
  };

  const close = () => {
    document.querySelectorAll('.sr-code-expanded').forEach((card) => card.classList.remove('sr-code-expanded'));
    document.body.classList.remove('sr-code-open');
    document.querySelectorAll('.sr-expand-code').forEach((button) => { button.textContent = 'Expand'; });
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance, { once: true });
  } else {
    enhance();
  }

  new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
})();
</script>`;

export async function GET(request) {
  const incoming = new URL(request.url);
  const upstreamUrl = new URL('https://scriptrush-api.vercel.app/');
  upstreamUrl.search = incoming.search;

  const upstream = await fetch(upstreamUrl, {
    cache: 'no-store',
    headers: {
      accept: request.headers.get('accept') || 'text/html',
      'accept-language': request.headers.get('accept-language') || 'en',
      'user-agent': request.headers.get('user-agent') || 'ScriptRush UI Proxy'
    }
  });

  let html = await upstream.text();
  html = html.includes('</head>') ? html.replace('</head>', STYLE + '</head>') : STYLE + html;
  html = html.includes('</body>') ? html.replace('</body>', SCRIPT + '</body>') : html + SCRIPT;

  return new Response(html, {
    status: upstream.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-scriptrush-ui-fix': 'script-viewer-v1'
    }
  });
}
