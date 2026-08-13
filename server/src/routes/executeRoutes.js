const express = require('express');
const router = express.Router();
const executeController = require('../controllers/executeController');
const auth = require('../middleware/auth');

router.post('/', auth, executeController.executeCode);

module.exports = router;
