require('dotenv').config();
const { initSentry } = require('./utils/sentry');
initSentry();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const { createAdapter } = require('@socket.io/redis-adapter');

const connectDB = require('./config/db');
const redisClient = require('./config/redis');
const logger = require('./utils/logger');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);

// Setup Socket.io
// Build allowed origins list
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
];
if (process.env.CLIENT_URL) {
  // Support comma-separated CLIENT_URL for multiple frontends
  process.env.CLIENT_URL.split(',').forEach(url => allowedOrigins.push(url.trim()));
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(null, true); // Allow all origins in production for now
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};

const io = new Server(server, { cors: corsOptions });

// Setup Redis Adapter for horizontal scaling
const pubClient = redisClient;
const subClient = redisClient.duplicate();
subClient.on('error', (err) => {
  logger.error('Redis subClient connection error: %s', err.message);
});
io.adapter(createAdapter(pubClient, subClient));

// Rate limiter for code execution to prevent abuse/spam
const executeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 execution requests per minute
  message: { message: 'Too many code execution requests. Please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const executeRoutes = require('./routes/executeRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/execute', executeLimiter, executeRoutes);

// Connect to Database
connectDB();

// Start Stale Room Cleanup Task
const { startCleanupTask } = require('./utils/cleanupTask');
startCleanupTask();

// Basic route to test server
app.get('/', (req, res) => {
  res.send('CodeSync API is running');
});

// Socket Handler
const socketHandler = require('./socket/index');
socketHandler(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
