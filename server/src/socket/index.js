const redisClient = require('../config/redis');
const Room = require('../models/Room');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const { captureError } = require('../utils/sentry');

const saveTimeouts = {};

module.exports = (io) => {
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`);

    // Join Room
    socket.on('join-room', async ({ roomId, user }) => {
      // Input Validation
      if (typeof roomId !== 'string' || !user || typeof user.id !== 'string' || typeof user.username !== 'string') {
        logger.warn(`Invalid join-room payload received from socket: ${socket.id}`);
        return;
      }

      socket.join(roomId);
      socket.roomId = roomId;
      socket.user = user;

      let activeUsers = [];
      if (redisClient.isConnected()) {
        try {
          await redisClient.hset(`active-users:${roomId}`, socket.id, JSON.stringify(user));
          const usersData = await redisClient.hgetall(`active-users:${roomId}`);
          activeUsers = Object.values(usersData).map(u => JSON.parse(u));
        } catch (redisErr) {
          logger.error('Redis error during active-users join-room: %s', redisErr.message);
          captureError(redisErr, { roomId, eventType: 'join-room-active-users' });
          activeUsers = [user]; // degraded mode
        }
      } else {
        activeUsers = [user]; // degraded mode
      }

      let currentCode = '';
      let language = 'javascript';
      
      let cachedRoomCode = null;
      if (redisClient.isConnected()) {
        try {
          cachedRoomCode = await redisClient.get('room-code:' + roomId);
        } catch (redisErr) {
          logger.error('Redis error reading room-code: %s', redisErr.message);
          captureError(redisErr, { roomId, eventType: 'join-room-cached-code' });
        }
      }

      if (cachedRoomCode !== null) {
        currentCode = cachedRoomCode;
      }

      try {
        const room = await Room.findOne({ roomId });
        if (room) {
          language = room.language;
          if (cachedRoomCode === null) {
            currentCode = room.currentCode;
          }
        }
      } catch (dbErr) {
        logger.error('Database query error during join-room: %s', dbErr.message);
        captureError(dbErr, { roomId, eventType: 'join-room-db-query' });
      }

      socket.emit('room-joined', { currentCode, language, activeUsers });
      socket.to(roomId).emit('user-joined', { activeUsers });

      const joinMsg = new Message({
          roomId,
          content: `${user.username} joined the room`,
          type: 'system'
      });
      try {
        await joinMsg.save();
        io.to(roomId).emit('new-message', joinMsg);
      } catch (dbErr) {
        logger.error('Database save error for join message: %s', dbErr.message);
        captureError(dbErr, { roomId, eventType: 'join-room-save-msg' });
      }
    });

    // Chat History
    socket.on('get-chat-history', async ({ roomId }) => {
      if (typeof roomId !== 'string') return;
      try {
        const messages = await Message.find({ roomId }).sort({ createdAt: -1 }).limit(50);
        socket.emit('chat-history', messages.reverse());
      } catch (dbErr) {
        logger.error('Database query error for chat history: %s', dbErr.message);
        captureError(dbErr, { roomId, eventType: 'get-chat-history' });
      }
    });

    // Send Message
    socket.on('send-message', async ({ roomId, content }) => {
      if (!socket.user || typeof roomId !== 'string' || typeof content !== 'string' || !content.trim()) return;

      // Restrict chat spam lengths
      if (content.length > 2000) return;

      // Basic HTML sanitization for prevention of script injection
      const sanitizedContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      const msg = new Message({
         roomId,
         userId: socket.user.id,
         username: socket.user.username,
         avatarColor: socket.user.avatarColor,
         content: sanitizedContent,
         type: 'text'
      });
      try {
        await msg.save();
        io.to(roomId).emit('new-message', msg);
      } catch (dbErr) {
        logger.error('Database save error for chat message: %s', dbErr.message);
        captureError(dbErr, { roomId, eventType: 'send-message', userId: socket.user.id });
      }
    });

    // Code Change
    socket.on('code-change', async ({ roomId, code, userId }) => {
      if (typeof roomId !== 'string' || typeof code !== 'string' || code.length > 500000) return;

      socket.to(roomId).emit('code-update', { code });
      
      if (redisClient.isConnected()) {
        try {
          await redisClient.set('room-code:' + roomId, code);
        } catch (redisErr) {
          logger.error('Redis set error for room-code: %s', redisErr.message);
          captureError(redisErr, { roomId, eventType: 'code-change-redis-set' });
        }
      }

      // Debounced write with exponential backoff retry logic on Mongo connection drops
      clearTimeout(saveTimeouts[roomId]);
      saveTimeouts[roomId] = setTimeout(async () => {
        let attempts = 0;
        const maxAttempts = 3;
        
        const saveWithRetry = async () => {
          try {
            await Room.updateOne({ roomId }, { currentCode: code });
          } catch (e) {
            attempts++;
            if (attempts < maxAttempts) {
              const backoff = Math.pow(2, attempts) * 1000;
              logger.warn(`Failed to save code to MongoDB (attempt ${attempts}/${maxAttempts}), retrying in ${backoff}ms... Error: %s`, e.message);
              saveTimeouts[roomId] = setTimeout(saveWithRetry, backoff);
            } else {
              logger.error(`Critically failed to save code to MongoDB after ${maxAttempts} attempts: %s`, e.message);
              captureError(e, { roomId, eventType: 'code-change-db-save-critical' });
            }
          }
        };

        await saveWithRetry();
      }, 30000);
    });

    // Cursor Move
    socket.on('cursor-move', (payload) => {
      if (!payload || typeof payload.roomId !== 'string' || !payload.position) return;
      socket.to(payload.roomId).emit('cursor-update', payload);
    });

    // Language Change
    socket.on('language-change', async ({ roomId, language }) => {
      if (typeof roomId !== 'string' || typeof language !== 'string') return;
      try {
        await Room.updateOne({ roomId }, { language });
        socket.to(roomId).emit('language-updated', { language });
      } catch (dbErr) {
        logger.error('Database save error for language change: %s', dbErr.message);
        captureError(dbErr, { roomId, eventType: 'language-change' });
      }
    });

    // Code Executed
    socket.on('code-executed', ({ roomId, result, username }) => {
      if (typeof roomId !== 'string' || !result || typeof username !== 'string') return;
      socket.to(roomId).emit('code-executed', { result, username });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.id}`);
      if (socket.roomId && socket.user) {
        let activeUsers = [];
        if (redisClient.isConnected()) {
          try {
            await redisClient.hdel(`active-users:${socket.roomId}`, socket.id);
            const usersData = await redisClient.hgetall(`active-users:${socket.roomId}`);
            activeUsers = Object.values(usersData).map(u => JSON.parse(u));
          } catch (redisErr) {
            logger.error('Redis error during active-users disconnect: %s', redisErr.message);
            captureError(redisErr, { roomId: socket.roomId, eventType: 'disconnect-redis-hdel' });
          }
        }
        
        socket.to(socket.roomId).emit('user-left', { 
            activeUsers 
        });

        const leaveMsg = new Message({
            roomId: socket.roomId,
            content: `${socket.user.username} left the room`,
            type: 'system'
        });
        try {
          await leaveMsg.save();
          io.to(socket.roomId).emit('new-message', leaveMsg);
        } catch (dbErr) {
          logger.error('Database save error for leave message: %s', dbErr.message);
          captureError(dbErr, { roomId: socket.roomId, eventType: 'disconnect-save-msg' });
        }
      }
    });

  });
};
