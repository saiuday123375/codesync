const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const auth = require('../middleware/auth');

router.post('/create', auth, roomController.createRoom);
router.get('/my-rooms', auth, roomController.getMyRooms);
router.get('/:roomId', auth, roomController.joinRoom); // using joinRoom logic for get Room details

module.exports = router;
