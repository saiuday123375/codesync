const axios = require('axios');
const { io } = require('socket.io-client');

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

async function runTestSuite() {
  console.log('====================================================');
  console.log('  STARTING ALL-IN-ONE AUTOMATED END-TO-END SUITE   ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST SECTION 1: AUTHENTICATION API
    // ----------------------------------------------------
    console.log('--- 1. Testing Authentication API ---');
    const timestamp = Date.now();
    const testUser = {
      username: `tester_${timestamp}`,
      email: `tester_${timestamp}@example.com`,
      password: 'SecurePassword123!'
    };

    // 1.1 Register
    const regRes = await axios.post(`${API_URL}/auth/register`, testUser);
    assert(regRes.status === 201, 'POST /api/auth/register returns 201 Created');
    assert(!!regRes.data.accessToken && !!regRes.data.refreshToken, 'Registration returns accessToken and refreshToken');
    assert(regRes.data.user.email === testUser.email, 'Returned user object matches registered email');

    // 1.2 Login
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    assert(loginRes.status === 200, 'POST /api/auth/login returns 200 OK');
    assert(!!loginRes.data.accessToken, 'Login response contains valid access token');

    const token = loginRes.data.accessToken;
    const refreshToken = loginRes.data.refreshToken;

    // 1.3 Get Me
    const meRes = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK');
    assert(meRes.data.user.username === testUser.username, 'GET /api/auth/me returns authenticated username');

    // 1.4 Refresh Token
    const refreshRes = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
    assert(refreshRes.status === 200, 'POST /api/auth/refresh returns 200 OK');
    assert(!!refreshRes.data.accessToken, 'Refresh token endpoint returns a fresh access token');

    // ----------------------------------------------------
    // TEST SECTION 2: ROOM MANAGEMENT & CACHING
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Room Management API ---');
    
    // 2.1 Create Room
    const roomPayload = { name: `Test Suite Room ${timestamp}`, language: 'javascript' };
    const createRoomRes = await axios.post(`${API_URL}/rooms/create`, roomPayload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(createRoomRes.status === 201, 'POST /api/rooms/create returns 201 Created');
    assert(!!createRoomRes.data.roomId, 'Room created with valid UUID');
    const roomId = createRoomRes.data.roomId;

    // 2.2 List My Rooms
    const myRoomsRes = await axios.get(`${API_URL}/rooms/my-rooms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(myRoomsRes.status === 200, 'GET /api/rooms/my-rooms returns 200 OK');
    assert(myRoomsRes.data.some(r => r.roomId === roomId), 'My Rooms list contains created room');

    // 2.3 Fetch/Join Room (MongoDB + Redis cache verification)
    const getRoomRes = await axios.get(`${API_URL}/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(getRoomRes.status === 200, 'GET /api/rooms/:roomId returns 200 OK');
    assert(getRoomRes.data.name === roomPayload.name, 'Fetched room matches created room name');

    // ----------------------------------------------------
    // TEST SECTION 3: CODE EXECUTION (JUDGE0)
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Code Execution API ---');
    const codeSnippet = 'console.log("SUITE_VERIFICATION_PASS");';
    const execRes = await axios.post(`${API_URL}/execute`, {
      code: codeSnippet,
      language: 'javascript'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(execRes.status === 200, 'POST /api/execute returns 200 OK');
    assert(execRes.data.stdout && execRes.data.stdout.trim() === 'SUITE_VERIFICATION_PASS', 'Judge0 compiler execution returned expected stdout');

    // ----------------------------------------------------
    // TEST SECTION 4: REAL-TIME WEBSOCKETS (SOCKET.IO & REDIS)
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Real-time WebSockets ---');
    const socket = io(SOCKET_URL, { autoConnect: true });

    await new Promise((resolve) => {
      socket.on('connect', () => {
        assert(socket.connected, 'Socket.io client connected to server');
        resolve();
      });
    });

    // 4.1 Join Room via socket
    socket.emit('join-room', {
      roomId,
      user: { id: meRes.data.user.id, username: testUser.username, avatarColor: '#FF5733' }
    });

    await new Promise((resolve) => {
      socket.on('room-joined', (data) => {
        assert(data && data.language === 'javascript', 'Received "room-joined" event with initial room state');
        resolve();
      });
    });

    // 4.2 Send Chat Message
    const chatContent = 'Hello from automated test suite!';
    socket.emit('send-message', { roomId, content: chatContent });

    await new Promise((resolve) => {
      socket.on('new-message', (msg) => {
        if (msg.content === chatContent) {
          assert(msg.content === chatContent, 'Received "new-message" socket broadcast with text content');
          resolve();
        }
      });
    });

    // 4.3 Code Change & Broadcast
    socket.emit('code-change', { roomId, code: 'let x = 10;', userId: meRes.data.user.id });

    // 4.4 Chat History Retrieval
    socket.emit('get-chat-history', { roomId });
    await new Promise((resolve) => {
      socket.on('chat-history', (history) => {
        assert(Array.isArray(history) && history.length > 0, 'Received "chat-history" with persisted chat messages');
        resolve();
      });
    });

    socket.disconnect();
    assert(!socket.connected, 'Socket disconnected cleanly');

  } catch (err) {
    console.error('  ❌ Test Exception:', err.response?.data || err.message);
  } finally {
    console.log('\n====================================================');
    console.log(`  SUITE SUMMARY: ${passed} / ${total} CHECKS PASSED (${Math.round((passed/total)*100)}%)`);
    console.log('====================================================\n');
  }
}

runTestSuite();
