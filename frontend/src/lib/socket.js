import { io } from 'socket.io-client';

let socket = null;

/**
 * One shared Socket.IO connection.
 *
 * Authenticates with either the user's JWT or a trusted contact's share token
 * — the server verifies room membership on subscribe either way.
 */
export function getSocket({ token, shareToken } = {}) {
  if (socket?.connected || socket?.connecting) return socket;

  socket = io(import.meta.env.VITE_SOCKET_URL ?? '/', {
    auth: token ? { token } : { shareToken },
    autoConnect: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
