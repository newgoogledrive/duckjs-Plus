// server.js
const express = require('express');
const fetch = require('node-fetch'); // node-fetch v2 (npm install node-fetch@2)
const cheerio = require('cheerio');
const { URL } = require('url');
const path = require('path');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve your UI and assets
app.use(express.static(path.join(__dirname, 'public')));

// Utility: build absolute URL from base + relative
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).toString();
  } catch (err) {
    return relative;
  }
}

// Utility: escape for query string
function enc(u) {
  return encodeURIComponent(u);
}

// The proxy endpoint. Example usage: /proxy?url=https://example.com
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) {
    res.status(400).send('Missing url parameter. Use /proxy?url=https://example.com');
    return;
  }

  // Basic validation: only http(s)
  if (!/^https?:\/\//i.test(target)) {
    res.status(400).send('Only http(s) URLs are supported.');
    return;
  }

  try {
    // Forward some request headers to mimic real browser
    const forwardedHeaders = {
      'user-agent': req.get('user-agent') || 'Mozilla/5.0 (duckjs-Plus proxy)',
      'accept': req.get('accept') || '*/*',
      'accept-language': req.get('accept-language') || 'en-US,en;q=0.9'
    };

    // Use node-fetch to get the target resource
    const upstream = await fetch(target, {
      headers: forwardedHeaders,
      redirect: 'follow',
      compress: true,
    });

    // If content-type is HTML, we will parse + rewrite links
    const contentType = upstream.headers.get('content-type') || '';

    // Copy most headers (some will be removed)
    const outgoingHeaders = {};
    upstream.headers.forEach((v, k) => { outgoingHeaders[k] = v; });

    // Remove / modify blocking headers so the proxied page loads in our context
    delete outgoingHeaders['content-security-policy'];
    delete outgoingHeaders['content-security-policy-report-only'];
    delete outgoingHeaders['x-frame-options'];
    delete outgoingHeaders['x-xss-protection'];
    // do not forward set-cookie directly (could be handled but for simple proxy we skip)
    delete outgoingHeaders['set-cookie'];

    // If response is HTML -> parse + rewrite URLs
    if (contentType.includes('text/html')) {
      const text = await upstream.text();

      // Load into cheerio for safe rewriting
      const $ = cheerio.load(text, { decodeEntities: false });

      // Attributes to rewrite: src, href, action
      $('*[src]').each((i, el) => {
        const $el = $(el);
        const src = $el.attr('src');
        if (!src) return;
        const abs = resolveUrl(target, src);
        $el.attr('src', `/proxy?url=${enc(abs)}`);
      });

      $('*[href]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        if (!href) return;
        // skip anchor-only hrefs like "#top"
        if (href.startsWith('#')) return;
        const abs = resolveUrl(target, href);
        $el.attr('href', `/proxy?url=${enc(abs)}`);
      });

      // Handle forms: rewrite action
      $('form[action]').each((i, el) => {
        const $el = $(el);
        const action = $el.attr('action');
        if (!action) return;
        const abs = resolveUrl(target, action);
        $el.attr('action', `/proxy?url=${enc(abs)}`);
      });

      // Handle <link rel="stylesheet"> and generic link elements (some already matched by href)
      $('link[href]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        if (!href) return;
        const abs = resolveUrl(target, href);
        $el.attr('href', `/proxy?url=${enc(abs)}`);
      });

      // Handle srcset (images with multiple candidate URLs)
      $('*[srcset]').each((i, el) => {
        const $el = $(el);
        const raw = $el.attr('srcset');
        if (!raw) return;
        // srcset format: "url1 1x, url2 2x"
        const parts = raw.split(',').map(p => {
          const trimmed = p.trim();
          const spaceIndex = trimmed.indexOf(' ');
          if (spaceIndex === -1) {
            const abs = resolveUrl(target, trimmed);
            return `/proxy?url=${enc(abs)}`;
          } else {
            const urlPart = trimmed.slice(0, spaceIndex);
            const rest = trimmed.slice(spaceIndex + 1);
            const abs = resolveUrl(target, urlPart);
            return `/proxy?url=${enc(abs)} ${rest}`;
          }
        });
        $el.attr('srcset', parts.join(', '));
      });

      // Rewrite meta refresh (if present)
      $('meta[http-equiv="refresh"]').each((i, el) => {
        const $el = $(el);
        const content = $el.attr('content');
        if (!content) return;
        // typical format: "5; url=/somewhere"
        const match = content.match(/^\s*([^;]+);\s*url=(.+)$/i);
        if (match) {
          const time = match[1];
          const url = match[2].trim().replace(/^['"]|['"]$/g, '');
          const abs = resolveUrl(target, url);
          $el.attr('content', `${time}; url=/proxy?url=${enc(abs)}`);
        }
      });

      // Optionally inject a small banner so users know they're viewing proxied content
      $('body').prepend(`<div id="duckjs-proxy-banner" style="position:fixed;left:8px;top:8px;z-index:9999;background:#222;color:#fff;padding:6px 10px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;opacity:0.9;">proxied: ${target}</div>`);

      // Send rewritten HTML
      const outHtml = $.html();
      res.set('content-type', 'text/html; charset=utf-8');
      // Forward other headers that are harmless/required
      if (outgoingHeaders['cache-control']) res.set('Cache-Control', outgoingHeaders['cache-control']);
      res.status(upstream.status).send(outHtml);
      return;
    }

    // Non-HTML: stream the binary (images, css, js, etc.)
    // Set content-type and other safe headers
    if (outgoingHeaders['content-type']) res.set('Content-Type', outgoingHeaders['content-type']);
    if (outgoingHeaders['content-length']) res.set('Content-Length', outgoingHeaders['content-length']);
    if (outgoingHeaders['cache-control']) res.set('Cache-Control', outgoingHeaders['cache-control']);

    res.status(upstream.status);

    // Stream body
    const bodyStream = upstream.body;
    if (bodyStream && bodyStream.pipe) {
      bodyStream.pipe(res);
    } else {
      // fallback: buffer
      const buf = await upstream.buffer();
      res.send(buf);
    }

  } catch (err) {
    console.error('Proxy error for', target, err && err.message);
    res.status(500).send('Proxy fetch failed: ' + (err && err.message));
  }
});

// A convenience endpoint to redirect plain URLs to the proxy (optional)
app.get('/go', (req, res) => {
  const target = req.query.url;
  if (!target) {
    res.redirect('/');
    return;
  }
  res.redirect(`/proxy?url=${enc(target)}`);
});

app.listen(PORT, () => {
  console.log(`duckjs-Plus proxy running on http://localhost:${PORT}`);
});
