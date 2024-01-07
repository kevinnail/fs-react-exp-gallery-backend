const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
const authenticate = require('./middleware/authenticate.js');
const authorize = require('./middleware/authorize.js');
const path = require('path');

// Built in middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://fs-react-exp-gallery-kn.netlify.app',
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
