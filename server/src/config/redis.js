const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisClient = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    // Retry connection logic
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redisClient.on('connect', () => {
  logger.info('Redis Connected successfully');
});

redisClient.on('error', (err) => {
  logger.error('Redis connection error: %s', err.message);
});

redisClient.isConnected = () => {
  return redisClient.status === 'ready' || redisClient.status === 'connect';
};

module.exports = redisClient;
