import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { createRoom, getMyRooms } from '../api/rooms';
import { toast } from 'react-hot-toast';

const DashboardPage = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [joinRoomId, setJoinRoomId] = useState('');
  
  const [myRooms, setMyRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchMyRooms();
  }, []);

  const fetchMyRooms = async () => {
    try {
      const data = await getMyRooms();
      setMyRooms(data);
    } catch {
      toast.error('Failed to load your rooms');
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) return toast.error('Room name is required');
    
    setIsCreating(true);
    try {
      const room = await createRoom(roomName, language);
      const shareLink = `${window.location.origin}/room/${room.roomId}`;
      await navigator.clipboard.writeText(shareLink);
      toast.success(`Room created! Link copied to clipboard`, { duration: 4000 });
      navigate(`/room/${room.roomId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error creating room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return toast.error('Room ID / Link is required');
    
    // Extract actual ID if full URL is pasted
    let idToJoin = joinRoomId.trim();
    if (idToJoin.includes('/room/')) {
       const parts = idToJoin.split('/room/');
       idToJoin = parts[parts.length - 1].split('/')[0];
    }
    
    navigate(`/room/${idToJoin}`);
  };

  return (
    <div className="min-h-screen bg-vscode-bg text-vscode-text flex flex-col">
      {/* Navbar */}
      <nav className="flex justify-between items-center p-4 bg-[#252526] border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          CodeSync
        </h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-300 font-medium">{user?.username}</span>
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md cursor-help border border-gray-600"
              style={{ backgroundColor: user?.avatarColor }}
              title={user?.email}
            >
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          </div>
          <button 
            onClick={logout}
            className="text-sm bg-red-600 hover:bg-red-700 transition font-medium text-white px-3 py-1.5 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <div className="space-y-8">
          {/* Create Room Section */}
          <div className="bg-[#252526] border border-gray-700 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Create New Room</h2>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-300">Room Name</label>
                <input
                  type="text"
                  placeholder="e.g., Team Project, Interview..."
                  className="w-full rounded border border-gray-600 bg-[#3c3c3c] p-2.5 text-white focus:border-[#007acc] focus:outline-none transition"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">Programming Language</label>
                <select 
                  className="w-full rounded border border-gray-600 bg-[#3c3c3c] p-2.5 text-white focus:border-[#007acc] focus:outline-none transition appearance-none"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="c">C</option>
                </select>
              </div>
              <button 
                type="submit"
                disabled={isCreating}
                className="w-full bg-[#007acc] hover:bg-[#0098ff] text-white py-2.5 rounded font-medium transition disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Room'}
              </button>
            </form>
          </div>

          {/* Join Room Section */}
          <div className="bg-[#252526] border border-gray-700 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Join Existing Room</h2>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-300">Room ID or Link</label>
                <input
                  type="text"
                  placeholder="Paste room ID or full link here..."
                  className="w-full rounded border border-gray-600 bg-[#3c3c3c] p-2.5 text-white focus:border-[#007acc] focus:outline-none transition"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded font-medium transition"
              >
                Join Room
              </button>
            </form>
          </div>
        </div>

        {/* My Rooms Section */}
        <div className="bg-[#252526] border border-gray-700 rounded-lg p-6 shadow-lg flex flex-col h-[525px]">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">My Rooms</h2>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {loadingRooms ? (
              <p className="text-gray-400 text-center py-4">Loading your rooms...</p>
            ) : myRooms.length === 0 ? (
              <p className="text-gray-400 text-center py-4">You haven't created any rooms yet.</p>
            ) : (
              myRooms.map((room) => (
                <div 
                  key={room._id} 
                  className="bg-[#1e1e1e] border border-gray-700 p-4 rounded hover:border-[#007acc] hover:bg-[#2d2d2d] transition group"
                >
                  <div className="flex justify-between items-start mb-2 cursor-pointer" onClick={() => navigate(`/room/${room.roomId}`)}>
                    <h3 className="font-bold text-white group-hover:text-[#007acc] transition">{room.name}</h3>
                    <span className="text-xs px-2 py-1 bg-gray-700 rounded-full text-gray-300 uppercase tracking-wider">{room.language}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500">
                      Created: {new Date(room.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const link = `${window.location.origin}/room/${room.roomId}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Room link copied!');
                      }}
                      className="text-xs bg-gray-700 hover:bg-[#007acc] text-gray-300 hover:text-white px-2 py-1 rounded transition"
                      title="Copy shareable link"
                    >
                      📋 Copy Link
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </main>
    </div>
  );
};

export default DashboardPage;
