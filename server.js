// server.js
const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // node-fetch v2
const cheerio = require('cheerio');
const { URL } = require('url');
const { createBareServer } = require('@titaniumnetwork-dev/ultraviolet/bare-server-node');

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------
// STEP 1: Serve your public folder (UI + assets + favicon + logo)
// -----------------------------------
app.use(express.static(path.join(__dirname, 'public'), { fallthrough: true }));

// -----------------------------------
// STEP 2: Serve Ultraviolet client files
// -----------------------------------
app.use('/uv/', express.static(path.join(__dirname, 'node_modules/@titaniumnetwork-dev/ultraviolet/dist')));

// -----------------------------------
// STEP 3: UV bare server for full browser-like proxying
// -----------------------------------
const bare = createBareServer();

app.use((req, res, next) => {
  if (bare.shouldRoute(req)) return bare.routeRequest(req, res);
  next();
});

// -----------------------------------
// STEP 4: DuckJS proxy route (rewriting HTML links)
// -----------------------------------
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).toString();
  } catch (err) {
    return relative;
  }
}

function enc(u) {
  return encodeURIComponent(u);
}

app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url parameter: /proxy?url=https://example.com');

  if (!/^https?:\/\//i.test(target)) {
    return res.status(400).send('Only http(s) URLs are supported.');
  }

  try {
    const forwardedHeaders = {
      'user-agent': req.get('user-agent') || 'Mozilla/5.0 (duckjs-Plus proxy)',
      'accept': req.get('accept') || '*/*',
      'accept-language': req.get('accept-language') || 'en-US,en;q=0.9'
    };

    const upstream = await fetch(target, { headers: forwardedHeaders, redirect: 'follow', compress: true });
    const contentType = upstream.headers.get('content-type') || '';

    const outgoingHeaders = {};
    upstream.headers.forEach((v, k) => { outgoingHeaders[k] = v; });

    delete outgoingHeaders['content-security-policy'];
    delete outgoingHeaders['content-security-policy-report-only'];
    delete outgoingHeaders['x-frame-options'];
    delete outgoingHeaders['x-xss-protection'];
    delete outgoingHeaders['set-cookie'];

    if (contentType.includes('text/html')) {
      const text = await upstream.text();
      const $ = cheerio.load(text, { decodeEntities: false });

      // rewrite src, href, action, link, srcset, meta refresh
      $('*[src]').each((i, el) => {
        const $el = $(el);
        const src = $el.attr('src');
        if (!src) return;
        $el.attr('src', `/proxy?url=${enc(resolveUrl(target, src))}`);
      });

      $('*[href]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        if (!href) return;
        if (href.startsWith('#')) return;
        $el.attr('href', `/proxy?url=${enc(resolveUrl(target, href))}`);
      });

      $('form[action]').each((i, el) => {
        const $el = $(el);
        const action = $el.attr('action');
        if (!action) return;
        $el.attr('action', `/proxy?url=${enc(resolveUrl(target, action))}`);
      });

      $('link[href]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        if (!href) return;
        $el.attr('href', `/proxy?url=${enc(resolveUrl(target, href))}`);
      });

      $('*[srcset]').each((i, el) => {
        const $el = $(el);
        const raw = $el.attr('srcset');
        if (!raw) return;
        const parts = raw.split(',').map(p => {
          const trimmed = p.trim();
          const spaceIndex = trimmed.indexOf(' ');
          if (spaceIndex === -1) return `/proxy?url=${enc(resolveUrl(target, trimmed))}`;
          const urlPart = trimmed.slice(0, spaceIndex);
          const rest = trimmed.slice(spaceIndex + 1);
          return `/proxy?url=${enc(resolveUrl(target, urlPart))} ${rest}`;
        });
        $el.attr('srcset', parts.join(', '));
      });

      $('meta[http-equiv="refresh"]').each((i, el) => {
        const $el = $(el);
        const content = $el.attr('content');
        if (!content) return;
        const match = content.match(/^\s*([^;]+);\s*url=(.+)$/i);
        if (match) {
          const time = match[1];
          const url = match[2].trim().replace(/^['"]|['"]$/g, '');
          $el.attr('content', `${time}; url=/proxy?url=${enc(resolveUrl(target, url))}`);
        }
      });

      // Optional banner
      $('body').prepend(`<div id="duckjs-proxy-banner" style="position:fixed;left:8px;top:8px;z-index:9999;background:#222;color:#fff;padding:6px 10px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;opacity:0.9;">proxied: ${target}</div>`);

      res.set('content-type', 'text/html; charset=utf-8');
      if (outgoingHeaders['cache-control']) res.set('Cache-Control', outgoingHeaders['cache-control']);
      res.status(upstream.status).send($.html());
      return;
    }

    // Non-HTML: stream
    if (outgoingHeaders['content-type']) res.set('Content-Type', outgoingHeaders['content-type']);
    if (outgoingHeaders['content-length']) res.set('Content-Length', outgoingHeaders['content-length']);
    if (outgoingHeaders['cache-control']) res.set('Cache-Control', outgoingHeaders['cache-control']);

    res.status(upstream.status);
    if (upstream.body && upstream.body.pipe) {
      upstream.body.pipe(res);
    } else {
      const buf = await upstream.buffer();
      res.send(buf);
    }

  } catch (err) {
    console.error('Proxy error for', target, err && err.message);
    res.status(500).send('Proxy fetch failed: ' + (err && err.message));
  }
});

// Optional /go redirect
app.get('/go', (req, res) => {
  const target = req.query.url;
  if (!target) return res.redirect('/');
  res.redirect(`/proxy?url=${enc(target)}`);
});

// Catch-all: serve homepage
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => console.log(`duckjs-Plus running on port ${PORT}`));
