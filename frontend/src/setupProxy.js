const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * CRA dev-server proxy.
 * Forwards /api and /socket.io requests to the HTTPS backend.
 * This lets mobile devices on the LAN use plain HTTP (:3000) while
 * the backend runs with self-signed TLS (:5000).
 */
module.exports = function (app) {
  const target = 'https://[::1]:5000';
  const common = {
    target,
    changeOrigin: true,
    secure: false, // accept self-signed cert
  };

  app.use('/api', createProxyMiddleware(common));
  app.use('/socket.io', createProxyMiddleware({ ...common, ws: true }));
};
