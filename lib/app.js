const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
const helmet = require('helmet');
const authenticate = require('./middleware/authenticate.js');
const authorize = require('./middleware/authorize.js');
const path = require('path');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');

// Built in middleware
app.use(express.json());
app.use(cookieParser());

/* eslint-disable quotes */
// Nonce generation middleware
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Security middleware with proper CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          'www.googletagmanager.com',
          'www.google-analytics.com',
        ],
        styleSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          'fonts.googleapis.com',
          'cdnjs.cloudflare.com',
        ],
        fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          '*.s3.amazonaws.com',
          '*.s3.us-west-2.amazonaws.com',
          '*.cloudfront.net',
        ],
        mediaSrc: [
          "'self'",
          '*.s3.amazonaws.com',
          '*.s3.us-west-2.amazonaws.com',
          '*.cloudfront.net',
        ],
        connectSrc: [
          "'self'",
          'http://localhost:7890',
          'https://stresslessglass.kevinnail.com',
          'www.google-analytics.com',
          'www.googletagmanager.com',
          'stats.g.doubleclick.net',
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);
/* eslint-disable quotes */
// Rate limiting
// Testing
const testLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1-minute window for testing
  max: 150, // Lower limit for tests
  standardHeaders: true, // Include RateLimit headers
  legacyHeaders: false, // Disable X-RateLimit headers
  message: { code: 429, message: 'Too many requests, slow down.' }, // JSON response
});
// Production
const productionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 3000, // Higher limit for production
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: 'Too many requests, slow down.' },
});

// Apply the appropriate limiter based on environment
if (process.env.NODE_ENV === 'test') {
  app.use(testLimiter);
} else {
  app.use(productionLimiter);
}

app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:7890',
      'https://fs-react-exp-gallery-kn.netlify.app',
      'https://stresslessglass.kevinnail.com',
    ],
    credentials: true,
  }),
);

// App routes
app.use('/api/v1/users', require('./controllers/users'));
app.use('/api/v1/admin', [authenticate, authorize], require('./controllers/admin'));
app.use('/api/v1/main-gallery', require('./controllers/main-gallery'));
app.use('/api/v1/profile', authenticate, require('./controllers/profile').router);

app.use(express.static(path.join(__dirname, 'clientBuild/build')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1')) {
    next(); // It's an API route, so move to the next middleware
  } else {
    // Read the HTML file and inject nonce
    const htmlPath = path.join(__dirname, 'clientBuild/build', 'index.html');

    try {
      let html = fs.readFileSync(htmlPath, 'utf8');

      // Inject nonce into script tags that need it
      html = html.replace(/<script([^>]*)>/g, `<script$1 nonce="${res.locals.nonce}">`);

      // Also inject nonce into style tags if needed
      html = html.replace(/<style([^>]*)>/g, `<style$1 nonce="${res.locals.nonce}">`);

      // Inject nonce into any existing style attributes
      html = html.replace(/style="([^"]*)"/g, `style="$1" nonce="${res.locals.nonce}"`);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Error reading HTML file:', error);
      res.status(500).send('Internal Server Error');
    }
  }
});

// Error handling & 404 middleware for when
// a request doesn't match any app routes
app.use(require('./middleware/not-found'));
app.use(require('./middleware/error'));

module.exports = app;
