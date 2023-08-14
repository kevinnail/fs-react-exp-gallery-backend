const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
const authenticate = require('./middleware/authenticate.js');
const authorize = require('./middleware/authorize.js');

// Built in middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://fs-react-exp-gallery-kn.netlify.app',
      'https://deploy-preview-38--fs-react-exp-gallery-kn.netlify.app',
      'https://stresslessglass.kevinnail.com',
    ],
    credentials: true,
  })
);

// App routes
app.use('/api/v1/users', require('./controllers/users'));
app.use(
  '/api/v1/admin',
  [authenticate, authorize],
  require('./controllers/admin')
);
app.use('/api/v1/main-gallery', require('./controllers/main-gallery'));

// Error handling & 404 middleware for when
// a request doesn't match any app routes
app.use(require('./middleware/not-found'));
app.use(require('./middleware/error'));

module.exports = app;
