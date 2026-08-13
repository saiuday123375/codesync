import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { socket } from '../socket/socket';
import { AuthContext } from '../context/AuthContext';
import { joinRoom } from '../api/rooms';
import api from '../api/axios';
import { toast } from 'react-hot-toast';

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  
  const [roomData, setRoomData] = useState(null);
  const [currentCode, setCurrentCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [activeUsers, setActiveUsers] = useState([]);
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [outputPanelOpen, setOutputPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('output');
  const [stdinData, setStdinData] = useState('');
  const [outputData, setOutputData] = useState(null);
  const [runnerName, setRunnerName] = useState('');

  // Chat States
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const editorRef = useRef(null);
  const isRemoteChange = useRef(false);
  const cursorDecorations = useRef({});
  const chatScrollRef = useRef(null);

  // Fetch Room Initial Data
  useEffect(() => {
    const initRoom = async () => {
      try {
        const data = await joinRoom(roomId);
        setRoomData(data);
        setLanguage(data.language);

        socket.connect();
        socket.emit('join-room', { 
            roomId, 
            user: { id: user.id, username: user.username, avatarColor: user.avatarColor } 
        });
        socket.emit('get-chat-history', { roomId });

      } catch {
        toast.error('Room not found or unauthorized');
        navigate('/dashboard');
      }
    };
    
    if (user) {
        initRoom();
    }

    return () => {
      socket.disconnect();
    };
  }, [roomId, user, navigate]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

  // Socket Event Listeners
  useEffect(() => {
    const handleRoomJoined = ({ currentCode, language, activeUsers }) => {
      setCurrentCode(currentCode);
      setLanguage(language);
      setActiveUsers(activeUsers);
    };

    const handleUserJoined = ({ activeUsers }) => {
      setActiveUsers(activeUsers);
    };

    const handleUserLeft = ({ activeUsers }) => {
      setActiveUsers(activeUsers);
    };

    const handleCodeUpdate = ({ code }) => {
      isRemoteChange.current = true;
      setCurrentCode(code);
    };

    const handleLanguageUpdated = ({ language: newLang }) => {
      setLanguage(newLang);
    };

    const handleCodeExecuted = ({ result, username }) => {
      setOutputData(result);
      setRunnerName(username);
      setOutputPanelOpen(true);
      setActiveTab('output');
      toast(`${username} ran the code`, { icon: '🚀' });
    };

    const handleChatHistory = (history) => {
      setMessages(history);
    };

    const handleNewMessage = (msg) => {
      setMessages(prev => {
         const filtered = prev.filter(m => !(m._id?.toString().startsWith('temp_') && m.content === msg.content && m.userId === msg.userId));
         return [...filtered, msg];
      });
      // Important to use functional state logic to access latest isChatOpen if inside a standard effect missing deps
      // We will access isChatOpen from ref or use functional logic.
      // Easiest is let React setUnreadCount. but isChatOpen closures. We can trust functional updates or check local store.
      // For simplicity, we just use functional setter conditionally inside a direct closure.
    };

    const handleCursorUpdate = (payload) => {
      if (!editorRef.current) return;
      const { userId, username, avatarColor, position } = payload;
      
      const monaco = window.monaco;
      if (!monaco) return;

      let styleId = `cursor-style-${userId}`;
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.innerHTML = `
          .cursor-${userId} {
            border-left: 2px solid ${avatarColor};
            position: relative;
            z-index: 10;
          }
          .cursor-${userId}::after {
            content: '${username}';
            position: absolute;
            top: -15px;
            left: 0;
            background: ${avatarColor};
            color: #fff;
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 2px;
            white-space: nowrap;
            pointer-events: none;
          }
        `;
        document.head.appendChild(styleEl);
      }

      const newDecorations = [
        {
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          options: { className: `cursor-${userId}`, isWholeLine: false }
        }
      ];

      cursorDecorations.current[userId] = editorRef.current.deltaDecorations(
        cursorDecorations.current[userId] || [],
        newDecorations
      );
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('code-update', handleCodeUpdate);
    socket.on('language-updated', handleLanguageUpdated);
    socket.on('cursor-update', handleCursorUpdate);
    socket.on('code-executed', handleCodeExecuted);
    socket.on('chat-history', handleChatHistory);
    socket.on('new-message', handleNewMessage);

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('code-update', handleCodeUpdate);
      socket.off('language-updated', handleLanguageUpdated);
      socket.off('cursor-update', handleCursorUpdate);
      socket.off('code-executed', handleCodeExecuted);
      socket.off('chat-history', handleChatHistory);
      socket.off('new-message', handleNewMessage);
    };
  }, []);

  // Update unread count manually when messages change
  // If the last message is not from me and chat is closed, increment unread
  useEffect(() => {
      if(messages.length === 0) return;
      const lastMsg = messages[messages.length - 1];
      if (!isChatOpen && lastMsg.userId !== user.id) {
          setUnreadCount(prev => prev + 1);
      }
  }, [messages, isChatOpen, user.id]);

  const handleEditorChange = (value) => {
    if (isRemoteChange.current) {
      isRemoteChange.current = false;
      return;
    }
    setCurrentCode(value);
    socket.emit('code-change', { roomId, code: value, userId: user.id });
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    window.monaco = monaco;

    editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      socket.emit('cursor-move', {
        roomId,
        userId: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
        position
      });
    });
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    socket.emit('language-change', { roomId, language: newLang });
  };

  const runCode = async () => {
    if (!currentCode.trim()) return toast.error('Code cannot be empty');
    
    setIsExecuting(true);
    setOutputPanelOpen(true);
    setActiveTab('output');
    setOutputData({ status: 'Executing...', stdout: null, stderr: null, compile_output: null });
    setRunnerName('You');

    try {
        const response = await api.post('/execute', {
            code: currentCode,
            language: language,
            stdin: stdinData
        });
        
        const result = response.data;
        setOutputData(result);
        
        socket.emit('code-executed', { roomId, result, username: user.username });
        
    } catch (err) {
        toast.error(err.response?.data?.message || 'Error executing code');
        setOutputData({ 
            status: 'Internal Error', 
            stderr: err.response?.data?.message || 'Failed to reach execution engine.'
        });
    } finally {
        setIsExecuting(false);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const content = chatInput.trim();
    
    const optMsg = {
        _id: 'temp_' + Date.now().toString(),
        userId: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
        content: content,
        type: 'text',
        createdAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, optMsg]);
    socket.emit('send-message', { roomId, content });
    setChatInput('');
  };

  if (!roomData) return <div className="flex h-screen items-center justify-center text-white bg-vscode-bg">Loading room...</div>;

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-white overflow-hidden">
      {/* NAVBAR */}
      <nav className="flex justify-between items-center p-3 bg-[#252526] border-b border-gray-700 shadow-md z-10 w-full flex-wrap shrink-0">
        <div className="flex items-center space-x-4 mb-2 sm:mb-0">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition font-medium">← Dashboard</button>
          <h1 className="text-lg font-bold truncate max-w-[150px] sm:max-w-[200px]">{roomData.name}</h1>
          
          <select 
            className="bg-[#3c3c3c] border border-gray-600 hover:border-[#007acc] rounded p-1 text-xs sm:text-sm focus:outline-none transition appearance-none min-w-[100px] text-center"
            value={language}
            onChange={handleLanguageChange}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
          </select>
        </div>
        
        <div className="flex items-center space-x-4 sm:space-x-6">
          <button
              onClick={runCode}
              disabled={isExecuting}
              className="bg-green-700 hover:bg-green-600 outline-none text-white font-bold py-1 px-4 rounded text-sm transition flex items-center shadow disabled:opacity-50"
          >
              <span>{isExecuting ? '⏳ Running...' : '▶ Run'}</span>
          </button>

          {/* CHAT TOGGLE */}
          <button 
            onClick={() => { setIsChatOpen(!isChatOpen); setUnreadCount(0); }}
            className="relative bg-transparent hover:bg-[#3c3c3c] border border-gray-600 px-3 py-1 rounded text-sm text-gray-300 transition flex items-center shadow"
          >
            <span>💬 Chat</span>
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <div className="flex items-center space-x-[-8px]">
            {activeUsers.map(u => (
              <div 
                key={u.userId || u.id}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-[#252526] z-10 hover:z-20 cursor-help transition transform hover:scale-110"
                style={{ backgroundColor: u.avatarColor }}
                title={u.username}
              >
                {u.username.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden relative">
        {/* MONACO EDITOR */}
        <div className={`flex-1 flex flex-col relative w-full h-full border-r border-gray-800 transition-all duration-300`}>
            <Editor
              height="100%"
              theme="vs-dark"
              language={language}
              value={currentCode}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
                fontFamily: 'Fira Code, JetBrains Mono, monospace',
                minimap: { enabled: false },
                wordWrap: "on",
                padding: { top: 16 },
                cursorBlinking: "smooth",
                smoothScrolling: true,
                formatOnPaste: true,
              }}
            />
        </div>

        {/* CHAT PANEL */}
        {isChatOpen && (
          <div className="w-full sm:w-80 bg-[#1e1e1e] flex flex-col border-l border-gray-800 absolute right-0 top-0 h-full sm:relative z-20 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.3)] sm:shadow-none">
            
            <div className="p-3 border-b border-gray-800 font-bold bg-[#252526] flex items-center justify-between shrink-0 shadow">
              <span className="flex items-center space-x-2 text-gray-200 tracking-wide text-sm"><span>💬</span> <span>Room Chat</span></span>
              <button 
                  onClick={() => setIsChatOpen(false)} 
                  className="text-gray-400 hover:text-white bg-[#3c3c3c] hover:bg-gray-600 rounded-full w-6 h-6 flex items-center justify-center transition"
              >✕
              </button>
            </div>
            
            {/* messages scroll area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar bg-[#1e1e1e]" ref={chatScrollRef}>
              {messages.map(msg => (
                msg.type === 'system' ? (
                  <div key={msg._id} className="text-center italic text-[11px] text-gray-500 my-2 px-4 shadow-sm bg-[#252526] rounded-full py-1 w-max mx-auto border border-gray-800">
                    {msg.content}
                  </div>
                ) : (
                  <div key={msg._id} className={`flex flex-col ${msg.userId === user.id ? 'items-end' : 'items-start'}`}>
                    
                    {msg.userId !== user.id && (
                       <div className="flex items-center space-x-2 mb-1 pl-1">
                         <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow" style={{ backgroundColor: msg.avatarColor }}>
                            {msg.username?.charAt(0).toUpperCase()}
                         </div>
                         <span className="text-xs text-gray-400 font-semibold">{msg.username}</span>
                         <span className="text-[10px] text-gray-600 font-sans">{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                    )}
                    
                    {msg.userId === user.id && (
                        <div className="flex items-end space-x-2 mb-1 pr-1">
                           <span className="text-[10px] text-gray-600 font-sans">{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                    )}
                    
                    <div className={`px-3 py-2 rounded-xl text-sm max-w-[85%] shadow-lg leading-relaxed ${
                        msg.userId === user.id 
                            ? 'bg-[#007acc] text-white rounded-br-sm' 
                            : 'bg-[#2d2d2d] border border-gray-700 text-gray-200 rounded-bl-sm'
                    }`}>
                      <span className="break-words">{msg.content}</span>
                    </div>
                  </div>
                )
              ))}
            </div>
            
            {/* Input area */}
            <form onSubmit={sendMessage} className="p-3 bg-[#252526] border-t border-gray-800 flex space-x-2 shrink-0">
              <input 
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-[#1e1e1e] border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#007acc] transition shadow-inner"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                autoComplete="off"
              />
              <button 
                type="submit" 
                disabled={!chatInput.trim()} 
                className="bg-[#007acc] hover:bg-[#0098ff] text-white px-3 py-2 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow"
              >
                 ➤
              </button>
            </form>
          </div>
        )}
      </div>

      {/* OUTPUT PANEL */}
      <div className={`bg-[#1e1e1e] border-t border-gray-800 flex flex-col transition-all duration-300 ease-in-out shrink-0 z-10 ${outputPanelOpen ? 'h-64' : 'h-10'}`}>
          <div className="px-4 bg-[#252526] border-b border-black text-xs font-medium flex justify-between tracking-widest shadow items-center h-10">
              <div className="flex space-x-4 h-full">
                  <button 
                      onClick={() => { setOutputPanelOpen(true); setActiveTab('output'); }}
                      className={`flex items-center h-full px-2 border-b-2 transition ${activeTab === 'output' && outputPanelOpen ? 'border-[#007acc] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                  >
                      OUTPUT
                  </button>
                  <button 
                      onClick={() => { setOutputPanelOpen(true); setActiveTab('input'); }}
                      className={`flex items-center h-full px-2 border-b-2 transition ${activeTab === 'input' && outputPanelOpen ? 'border-[#007acc] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                  >
                      INPUT
                  </button>
              </div>
              <div className="flex space-x-4 items-center">
                  {runnerName && outputPanelOpen && (
                      <span className="text-gray-500 hidden sm:inline normal-case tracking-normal">Run by {runnerName}</span>
                  )}
                  <button onClick={() => setOutputPanelOpen(!outputPanelOpen)} className="text-gray-400 hover:text-white transition">
                      {outputPanelOpen ? '▼ Collapse' : '▲ Expand'}
                  </button>
              </div>
          </div>
          
          {outputPanelOpen && (
              <div className="flex-1 p-4 font-mono text-[13px] overflow-y-auto custom-scrollbar bg-[#1e1e1e]">
                  {activeTab === 'input' ? (
                      <textarea
                          className="w-full h-full bg-[#1e1e1e] text-gray-300 focus:outline-none resize-none leading-relaxed"
                          placeholder="Enter standard input (stdin) here..."
                          value={stdinData}
                          onChange={(e) => setStdinData(e.target.value)}
                          spellCheck="false"
                      />
                  ) : (
                      <div className="space-y-4">
                          {outputData ? (
                              <>
                                  <div className="flex items-center space-x-4 text-xs font-sans mb-3 border-b border-gray-800 pb-3">
                                      <span className={`px-3 py-1 rounded-sm shadow-sm font-semibold tracking-wide ${
                                          outputData.status?.includes('Accepted') ? 'bg-green-900/50 text-green-400 border border-green-800/50' :
                                          outputData.status?.includes('Executing') ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800/50' :
                                          'bg-red-900/50 text-red-400 border border-red-800/50'
                                      }`}>
                                          Status: {outputData.status || 'Unknown'}
                                      </span>
                                      {outputData.time && <span className="text-gray-500">Run Time: {outputData.time}s</span>}
                                      {outputData.memory && <span className="text-gray-500">Memory: {outputData.memory}KB</span>}
                                  </div>
                                  
                                  {outputData.compile_output && (
                                      <div className="text-red-400 whitespace-pre-wrap bg-[#2d1b1b] p-3 rounded border border-red-900/30">
                                          <div className="text-[10px] text-red-500 mb-1 uppercase tracking-wider font-sans font-bold">Compiler Output:</div>
                                          {outputData.compile_output}
                                      </div>
                                  )}

                                  {outputData.stderr && (
                                      <div className="text-red-400 whitespace-pre-wrap bg-[#2d1b1b] p-3 rounded border border-red-900/30">
                                          <div className="text-[10px] text-red-500 mb-1 uppercase tracking-wider font-sans font-bold">Standard Error:</div>
                                          {outputData.stderr}
                                      </div>
                                  )}
                                  
                                  {outputData.stdout && (
                                      <div className="text-green-400 whitespace-pre-wrap mt-2 pl-1 leading-relaxed">
                                          {outputData.stdout}
                                      </div>
                                  )}
                                  
                                  {!outputData.stdout && !outputData.stderr && !outputData.compile_output && outputData.status && !outputData.status.includes('Executing') && (
                                      <div className="text-gray-500 italic pl-1">Process exited completely with no standard output.</div>
                                  )}
                              </>
                          ) : (
                              <div className="text-gray-500 italic flex items-center justify-center h-full">Click "Run" against the cloud engine to review output metrics.</div>
                          )}
                      </div>
                  )}
              </div>
          )}
      </div>
    </div>
  );
};

export default RoomPage;
