const Room = require('../models/Room');
const Message = require('../models/Message');
const redisClient = require('../config/redis');
const logger = require('./logger');

const cleanupStaleRooms = async () => {
  try {
    const ttlDays = parseInt(process.env.ROOM_TTL_DAYS || '30', 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays);

    // Find stale rooms using updatedAt (actively used rooms remain untouched)
    const staleRooms = await Room.find({ updatedAt: { $lt: cutoffDate } });
    if (staleRooms.length === 0) {
      logger.info(`[CLEANUP] Checked for stale rooms (older than ${ttlDays} days). None found.`);
      return;
    }

    logger.info(`[CLEANUP] Found ${staleRooms.length} stale rooms (older than ${ttlDays} days). Cleaning up...`);

    const roomIds = staleRooms.map(r => r.roomId);

    // Log details of each stale room for traceability
    staleRooms.forEach(room => {
      logger.info(`[CLEANUP] Purged stale room. ID: ${room.roomId}, Name: "${room.name}", Last Updated: ${room.updatedAt.toISOString()}`);
    });

    // Delete messages associated with stale rooms
    const msgDeleteResult = await Message.deleteMany({ roomId: { $in: roomIds } });
    logger.info(`[CLEANUP] Deleted ${msgDeleteResult.deletedCount} messages associated with stale rooms.`);

    // Remove from Redis cache
    if (redisClient.isConnected()) {
      for (const roomId of roomIds) {
        try {
          await redisClient.del(`room:${roomId}`);
          await redisClient.del(`room-code:${roomId}`);
          await redisClient.del(`active-users:${roomId}`);
        } catch (redisErr) {
          logger.error(`[CLEANUP] Failed to clear Redis key for room ${roomId}: %s`, redisErr.message);
        }
      }
    }

    // Delete rooms from MongoDB
    const roomDeleteResult = await Room.deleteMany({ roomId: { $in: roomIds } });
    logger.info(`[CLEANUP] Deleted ${roomDeleteResult.deletedCount} rooms from MongoDB.`);

  } catch (error) {
    logger.error('[CLEANUP] Stale rooms cleanup task failed: %s', error.message);
  }
};

const startCleanupTask = () => {
  // Execute cleanup once on startup
  cleanupStaleRooms();
  // Repeat check every 24 hours (24 * 60 * 60 * 1000 ms)
  setInterval(cleanupStaleRooms, 24 * 60 * 60 * 1000);
};

module.exports = { startCleanupTask, cleanupStaleRooms };
