/**
 * Cloudflare Worker — CORS Proxy（強化版）
 * 功能：Cache 5 分鐘 · Retry × 2 · Header 偽裝 · CORS 全開
 *
 * 部署：dash.cloudflare.com → Workers & Pages → Edit Code → 貼上 → Deploy
 */

const CACHE_TTL = 300; // 秒，5 分鐘

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    if (!targetUrl) {
      return corsResponse(JSON.stringify({ error: 'Missing ?url= parameter' }), 400);
    }

    // 嘗試從 Cloudflare Cache 取
    const cacheKey = new Request(targetUrl);
    const cache    = caches.default;
    const cached   = await cache.match(cacheKey);
    if (cached) {
      const clone = new Response(cached.body, cached);
      clone.headers.set('X-Cache', 'HIT');
      clone.headers.set('Access-Control-Allow-Origin', '*');
      return clone;
    }

    // 發出真實請求（最多 retry 2 次）
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const upstream = await fetch(targetUrl, {
          headers: buildHeaders(targetUrl),
          redirect: 'follow',
          cf: { cacheTtl: 0 }, // 不讓 CF 自己快取，我們手動控制
        });

        const body        = await upstream.arrayBuffer();
        const contentType = upstream.headers.get('Content-Type') || 'application/json';

        const response = new Response(body, {
          status: upstream.status,
          headers: {
            'Content-Type':                  contentType,
            'Access-Control-Allow-Origin':   '*',
            'Access-Control-Allow-Methods':  'GET, OPTIONS',
            'Access-Control-Allow-Headers':  '*',
            'X-Cache':                       'MISS',
            'Cache-Control':                 `public, max-age=${CACHE_TTL}`,
          },
        });

        // 只快取成功的回應
        if (upstream.status === 200) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }

        return response;

      } catch (err) {
        lastErr = err;
        // 短暫等待後重試
        if (attempt < 2) await sleep(300 * (attempt + 1));
      }
    }

    return corsResponse(
      JSON.stringify({ error: 'Upstream failed: ' + lastErr.message }),
      502
    );
  },
};

/* ── helpers ── */

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type':                 'application/json',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildHeaders(url) {
  const origin = new URL(url).origin;
  return {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/html, */*;q=0.9',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         origin + '/',
    'Origin':          origin,
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
  };
}
