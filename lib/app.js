const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');

// Built in middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      //   'https://react-fs-ex-to-do-list.netlify.app',
      //   'https://deploy-preview-5--react-fs-ex-to-do-list.netlify.app',
    ],
    credentials: true,
  })
);
// App routes
app.use('/api/v1/users', require('./controllers/users'));

// Error handling & 404 middleware for when
// a request doesn't match any app routes
app.use(require('./middleware/not-found'));
app.use(require('./middleware/error'));

module.exports = app;
