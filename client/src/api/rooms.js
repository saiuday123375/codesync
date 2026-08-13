import api from './axios';

export const createRoom = async (name, language) => {
  const response = await api.post('/rooms/create', { name, language });
  return response.data;
};

export const joinRoom = async (roomId) => {
  const response = await api.get(`/rooms/${roomId}`);
  return response.data;
};

export const getMyRooms = async () => {
  const response = await api.get('/rooms/my-rooms');
  return response.data;
};
