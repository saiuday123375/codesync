const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

exports.createRoom = async (req, res) => {
  try {
    const { name, language } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    const roomId = uuidv4();
    const newRoom = new Room({
      roomId,
      name,
      language: language || 'javascript',
      createdBy: req.user.id,
      participants: [{
        userId: req.user.id,
        username: req.user.username,
        avatarColor: req.user.avatarColor
      }]
    });

    await newRoom.save();

    const roomData = newRoom.toObject();
    
    // Store in Redis (expire in 24 hours = 86400 seconds)
    if (redisClient.isConnected()) {
      try {
        await redisClient.setex(`room:${roomId}`, 86400, JSON.stringify(roomData));
      } catch (redisErr) {
        logger.error('Redis cache set error: %s', redisErr.message);
      }
    }

    res.status(201).json(roomData);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    // Check Redis first
    if (redisClient.isConnected()) {
      try {
        const cachedRoom = await redisClient.get(`room:${roomId}`);
        if (cachedRoom) {
          return res.status(200).json(JSON.parse(cachedRoom));
        }
      } catch (redisErr) {
        logger.error('Redis cache get error: %s', redisErr.message);
      }
    }

    // Checking MongoDB
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Put it back in Redis if found in MongoDB
    if (redisClient.isConnected()) {
      try {
        await redisClient.setex(`room:${roomId}`, 86400, JSON.stringify(room));
      } catch (redisErr) {
        logger.error('Redis cache set error: %s', redisErr.message);
      }
    }

    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getMyRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
