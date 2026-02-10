import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Application } from 'express';

/**
 * SSL/HTTPS Configuration
 *
 * Production: Uses Let's Encrypt certificates
 * Development: Uses HTTP (or self-signed certificates if needed)
 *
 * Setup Instructions:
 * 1. Install Certbot: sudo apt-get install certbot
 * 2. Get certificate: sudo certbot certonly --standalone -d yourdomain.com
 * 3. Certificates will be in: /etc/letsencrypt/live/yourdomain.com/
 * 4. Set SSL_CERT_PATH in .env to the certificate directory
 * 5. Auto-renewal: sudo certbot renew --dry-run
 */

interface SSLConfig {
  key: Buffer;
  cert: Buffer;
  ca?: Buffer;
}

/**
 * Get SSL configuration from environment
 */
export const getSSLConfig = (): SSLConfig | null => {
  const sslCertPath = process.env.SSL_CERT_PATH;
  const nodeEnv = process.env.NODE_ENV;
  const forceSsl = String(process.env.FORCE_SSL || '').toLowerCase() === 'true';

  // Default: only use SSL in production.
  // Local dev override: FORCE_SSL=true (needed for Slack OAuth redirect_uri on https://localhost).
  if (nodeEnv !== 'production' && !forceSsl) return null;

  if (!sslCertPath) {
    if (nodeEnv === 'production') {
      console.warn('⚠️  SSL_CERT_PATH not set in production - SSL/HTTPS disabled');
      console.warn('⚠️  For production, set SSL_CERT_PATH to your certificate directory');
    } else {
      console.warn('⚠️  FORCE_SSL=true but SSL_CERT_PATH is not set - SSL/HTTPS disabled');
    }
    return null;
  }

  try {
    const keyPath = path.join(sslCertPath, 'privkey.pem');
    const certPath = path.join(sslCertPath, 'fullchain.pem');
    const caPath = path.join(sslCertPath, 'chain.pem');

    // Check if certificate files exist
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      console.error('❌ SSL certificate files not found at:', sslCertPath);
      console.error('❌ Expected files: privkey.pem, fullchain.pem');
      console.error('❌ Run: sudo certbot certonly --standalone -d yourdomain.com');
      return null;
    }

    const sslConfig: SSLConfig = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    // Add CA bundle if exists
    if (fs.existsSync(caPath)) {
      sslConfig.ca = fs.readFileSync(caPath);
    }

    console.log('✅ SSL certificates loaded from:', sslCertPath);
    return sslConfig;
  } catch (error) {
    console.error('❌ Error loading SSL certificates:', error);
    return null;
  }
};

/**
 * Create secure HTTPS server or HTTP server based on configuration
 * With enhanced TLS settings
 */
export const createSecureServer = (app: Application): https.Server | http.Server => {
  const sslConfig = getSSLConfig();

  if (sslConfig) {
    console.log('🔒 Creating HTTPS server with SSL/TLS encryption');

    // Enhanced TLS configuration
    const httpsOptions = {
      ...sslConfig,
      // Force TLS 1.2 and 1.3 only (disable older protocols)
      minVersion: 'TLSv1.2' as const,
      maxVersion: 'TLSv1.3' as const,

      // Strong cipher suites (prefer modern, secure ciphers)
      ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
      ].join(':'),

      // Prefer server cipher order
      honorCipherOrder: true,

      // Enable session resumption for performance
      sessionIdContext: 'koda_secure_session',
    };

    return https.createServer(httpsOptions, app);
  }

  console.log('⚠️  Creating HTTP server (not secure for production!)');
  return http.createServer(app);
};

/**
 * Create HTTP to HTTPS redirect server
 * Only used in production when SSL is enabled
 */
export const createHTTPRedirectServer = (): http.Server | null => {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const sslConfig = getSSLConfig();
  if (!sslConfig) {
    return null;
  }

  const redirectApp = require('express')();

  // Redirect all HTTP traffic to HTTPS
  redirectApp.use((req: any, res: any) => {
    const host = req.headers.host || 'localhost';
    const url = `https://${host}${req.url}`;
    console.log(`↪️  Redirecting HTTP → HTTPS: ${req.url}`);
    res.redirect(301, url);
  });

  console.log('↪️  HTTP to HTTPS redirect server created');
  return http.createServer(redirectApp);
};

/**
 * Get port configuration for HTTP and HTTPS
 */
export const getPortConfig = () => {
  const nodeEnv = process.env.NODE_ENV;
  const sslConfig = getSSLConfig();

  if (nodeEnv === 'production' && sslConfig) {
    return {
      httpsPort: 443,
      httpPort: 80, // For redirect
      useSSL: true,
    };
  }

  return {
    httpsPort: parseInt(process.env.PORT || '5000'),
    httpPort: null,
    useSSL: false,
  };
};

/**
 * Certificate validation and expiry check
 */
export const checkCertificateExpiry = (): void => {
  const sslCertPath = process.env.SSL_CERT_PATH;

  if (!sslCertPath || process.env.NODE_ENV !== 'production') {
    return;
  }

  try {
    const certPath = path.join(sslCertPath, 'fullchain.pem');
    if (!fs.existsSync(certPath)) {
      return;
    }

    const certContent = fs.readFileSync(certPath, 'utf8');
    const certMatch = certContent.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);

    if (certMatch) {
      // Note: For production, use a proper certificate parsing library like 'node-forge'
      // This is a basic check - recommend using automated renewal with certbot
      console.log('✅ SSL certificate file found and readable');
      console.log('⚠️  Ensure certbot auto-renewal is configured:');
      console.log('    sudo certbot renew --dry-run');
    }
  } catch (error) {
    console.error('⚠️  Error checking certificate:', error);
  }
};

export default {
  getSSLConfig,
  createSecureServer,
  createHTTPRedirectServer,
  getPortConfig,
  checkCertificateExpiry,
};
