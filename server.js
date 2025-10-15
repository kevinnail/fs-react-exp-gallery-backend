const app = require('./lib/app');
const pool = require('./lib/utils/pool');
const WebSocketService = require('./lib/services/websocket');
const { initAuctionTimers } = require('./lib/jobs/auctionTimers.js');
const { initNotificationCleanup } = require('./lib/jobs/notificationsCleanup.js');

const API_URL = process.env.API_URL || 'http://localhost';
const PORT = process.env.PORT || 7890;

const server = app.listen(PORT, async () => {
  console.info(`✅  Server started on ${API_URL}:${PORT}`);
  await initAuctionTimers();
  await initNotificationCleanup();
});

// Initialize WebSocket service
const wsService = new WebSocketService(server);

// Make WebSocket service available globally for use in controllers
global.wsService = wsService;

process.on('exit', () => {
  console.info('👋  Goodbye!');
  pool.end();
});
