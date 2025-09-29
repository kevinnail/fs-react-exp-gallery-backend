const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
const helmet = require('helmet');
const authenticate = require('./middleware/authenticate.js');
const authorize = require('./middleware/authorize.js');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Built in middleware
app.use(express.json());
app.use(cookieParser());
// Security middleware
/* eslint-disable quotes */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'www.googletagmanager.com', 'www.google-analytics.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
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
        connectSrc: ["'self'", 'www.google-analytics.com', 'stats.g.doubleclick.net'],
        frameSrc: ["'self'"],
      },
    },
  })
);
/* eslint-enable quotes */

// Rate limiting - helps prevent brute force attacks
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
  })
);

// App routes
app.use('/api/v1/users', require('./controllers/users'));
app.use('/api/v1/admin', [authenticate, authorize], require('./controllers/admin'));
app.use('/api/v1/main-gallery', require('./controllers/main-gallery'));

app.use(express.static(path.join(__dirname, 'clientBuild/build')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1')) {
    next(); // It's an API route, so move to the next middleware
  } else {
    res.sendFile(path.join(__dirname, 'clientBuild/build', 'index.html'));
  }
});

// Error handling & 404 middleware for when
// a request doesn't match any app routes
app.use(require('./middleware/not-found'));
app.use(require('./middleware/error'));

module.exports = app;
