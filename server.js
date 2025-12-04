const express = require('express');
const httpProxy = require('http-proxy');
const basicAuth = require('basic-auth');
const path = require('path');

const app = express();
const proxy = httpProxy.createProxyServer({});

// === CONFIG VARIABLES ===
const PORT = process.env.PORT || 10000;
const DUCKJS_USER = process.env.DUCKJS_USER || 'duckadmin';
const DUCKJS_PASS = process.env.DUCKJS_PASS || 'password';

// === PASSWORD PROTECTION ===
app.use((req, res, next) => {
    const user = basicAuth(req);
    if (!user || user.name !== DUCKJS_USER || user.pass !== DUCKJS_PASS) {
        res.set('WWW-Authenticate', 'Basic realm="DuckJS Proxy"');
        return res.status(401).send('Authentication required.');
    }
    next();
});

// === SERVE DUCKJS FRONTEND ===
app.use('/', express.static(path.join(__dirname, 'public')));

// === SIMPLE HTTP PROXY ===
app.all('/proxy/*', (req, res) => {
    const targetUrl = decodeURIComponent(req.url.replace(/^\/proxy\//, ''));
    if (!targetUrl.startsWith('http')) {
        return res.status(400).send('Invalid URL');
    }
    proxy.web(req, res, { target: targetUrl, changeOrigin: true }, (err) => {
        console.error('Proxy error:', err.message);
        res.status(500).send('Proxy error');
    });
});

// === START SERVER ===
app.listen(PORT, () => {
    console.log(`DuckJS Proxy running on port ${PORT}`);
});
