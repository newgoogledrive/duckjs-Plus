const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// For simple UI or index page (optional)
// app.use(express.static('public'));

// Proxy any request under /proxy/*
app.use('/proxy', (req, res, next) => {
  // extract target URL from query param, e.g. /proxy/?url=https://example.com
  const targetUrl = req.query.url;
  if (!targetUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  // Create a proxy middleware instance on the fly
  createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: false,  
    onProxyReq(proxyReq, req, res) {
      // optional: adjust headers here (User-Agent, Accept, etc.)
    },
    onProxyRes(proxyRes, req, res) {
      // Remove content-length / compression headers if you want to rewrite response, or adjust CSP
      delete proxyRes.headers['content-length'];
    },
    pathRewrite: (path, req) => {
      // remove the /proxy prefix
      return path.replace(/^\/proxy/, '');
    },
  })(req, res, next);
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
