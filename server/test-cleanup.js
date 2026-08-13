const mongoose = require('mongoose');
const Redis = require('ioredis');
require('dotenv').config();

const Room = require('./src/models/Room');
const Message = require('./src/models/Message');
const { cleanupStaleRooms } = require('./src/utils/cleanupTask');
const logger = require('./src/utils/logger');

// Override logger info for test runtime to keep logs quiet if needed, or allow it
logger.level = 'info';

async function testCleanup() {
  console.log('====================================================');
  console.log('  STARTING MOCK DATABASE CLEANUP TASK TESTING       ');
  console.log('====================================================\n');

  // Connect MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codesync';
  await mongoose.connect(mongoUri);
  console.log('  Connected to MongoDB.');

  // Connect Redis
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisClient = new Redis(redisUrl);
  console.log('  Connected to Redis.');

  try {
    // 1. Purge old test entries
    await Room.deleteMany({ name: /^CleanupTest_/ });
    await Message.deleteMany({ content: /^CleanupTest_/ });
    console.log('  Cleaned up old CleanupTest entries.');

    // 2. Define Room IDs
    const staleRoomId = 'test_stale_room_123';
    const activeRoomId = 'test_active_room_123';

    // 3. Seed Stale Room (31 days ago)
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 31);

    await Room.collection.insertOne({
      roomId: staleRoomId,
      name: 'CleanupTest_Stale',
      language: 'javascript',
      currentCode: 'console.log("stale");',
      createdAt: staleDate,
      updatedAt: staleDate,
      isActive: true
    });
    console.log(`  Seeded stale room "${staleRoomId}" (updatedAt: 31 days ago)`);

    // 4. Seed Active Room (5 days ago)
    const activeDate = new Date();
    activeDate.setDate(activeDate.getDate() - 5);

    await Room.collection.insertOne({
      roomId: activeRoomId,
      name: 'CleanupTest_Active',
      language: 'javascript',
      currentCode: 'console.log("active");',
      createdAt: activeDate,
      updatedAt: activeDate,
      isActive: true
    });
    console.log(`  Seeded active room "${activeRoomId}" (updatedAt: 5 days ago)`);

    // 5. Seed Messages
    await Message.collection.insertOne({
      roomId: staleRoomId,
      content: 'CleanupTest: Old message',
      type: 'text',
      createdAt: staleDate
    });
    await Message.collection.insertOne({
      roomId: activeRoomId,
      content: 'CleanupTest: New message',
      type: 'text',
      createdAt: activeDate
    });
    console.log('  Seeded test messages.');

    // 6. Seed Redis keys
    await redisClient.set(`room:${staleRoomId}`, 'stale_cache');
    await redisClient.set(`room-code:${staleRoomId}`, 'stale_code');
    await redisClient.set(`room:${activeRoomId}`, 'active_cache');
    await redisClient.set(`room-code:${activeRoomId}`, 'active_code');
    console.log('  Seeded Redis cache keys.');

    // Set configuration environment variable
    process.env.ROOM_TTL_DAYS = '30';

    // 7. Run Cleanup Function
    console.log('\n  --> Executing Cleanup Task...');
    
    await cleanupStaleRooms();

    // 8. Assertions
    console.log('\n  --> Running Verification Assertions...');

    // Mongo Assertions
    const foundStaleRoom = await Room.findOne({ roomId: staleRoomId });
    const foundActiveRoom = await Room.findOne({ roomId: activeRoomId });

    const foundStaleMsg = await Message.findOne({ roomId: staleRoomId });
    const foundActiveMsg = await Message.findOne({ roomId: activeRoomId });

    // Redis Assertions
    const staleCache = await redisClient.get(`room:${staleRoomId}`);
    const staleCode = await redisClient.get(`room-code:${staleRoomId}`);
    const activeCache = await redisClient.get(`room:${activeRoomId}`);
    const activeCode = await redisClient.get(`room-code:${activeRoomId}`);

    let passed = true;

    // Verify stale room deleted
    if (foundStaleRoom === null) {
      console.log('  [PASS] Stale Room deleted from MongoDB');
    } else {
      console.error('  [FAIL] Stale Room still exists in MongoDB');
      passed = false;
    }

    // Verify active room kept
    if (foundActiveRoom !== null) {
      console.log('  [PASS] Active Room preserved in MongoDB');
    } else {
      console.error('  [FAIL] Active Room was incorrectly deleted');
      passed = false;
    }

    // Verify stale messages deleted
    if (foundStaleMsg === null) {
      console.log('  [PASS] Stale messages deleted from MongoDB');
    } else {
      console.error('  [FAIL] Stale messages still exist');
      passed = false;
    }

    // Verify active messages kept
    if (foundActiveMsg !== null) {
      console.log('  [PASS] Active messages preserved in MongoDB');
    } else {
      console.error('  [FAIL] Active messages were deleted');
      passed = false;
    }

    // Verify stale Redis cache deleted
    if (staleCache === null && staleCode === null) {
      console.log('  [PASS] Stale Redis keys deleted');
    } else {
      console.error('  [FAIL] Stale Redis keys still exist');
      passed = false;
    }

    // Verify active Redis cache kept
    if (activeCache !== null && activeCode !== null) {
      console.log('  [PASS] Active Redis keys preserved');
    } else {
      console.error('  [FAIL] Active Redis keys were deleted');
      passed = false;
    }

    // Clean up test entries from DB
    await Room.deleteMany({ name: /^CleanupTest_/ });
    await Message.deleteMany({ content: /^CleanupTest_/ });
    await redisClient.del(`room:${activeRoomId}`);
    await redisClient.del(`room-code:${activeRoomId}`);

    console.log('\n====================================================');
    if (passed) {
      console.log('  STATUS: ALL CLEANUP TESTS PASSED SUCCESSFULLY! ✅');
    } else {
      console.error('  STATUS: CLEANUP TESTS FAILED! ❌');
    }
    console.log('====================================================\n');

  } catch (error) {
    console.error('Test Error:', error);
  } finally {
    await mongoose.connection.close();
    await redisClient.quit();
  }
}

testCleanup();
