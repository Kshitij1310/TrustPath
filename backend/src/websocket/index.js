import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';

let io = null;

const journeyRoom = (journeyId) => `journey:${journeyId}`;

/**
 * Attach Socket.IO to the HTTP server.
 *
 * Two kinds of client may listen to a journey:
 *   - the traveller, authenticated with their JWT
 *   - a trusted contact, holding only a share token
 * Both are verified before joining the room; nothing is broadcast globally.
 */
export function initWebsocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const { token, shareToken } = socket.handshake.auth ?? {};
    if (shareToken) {
      socket.data.shareToken = shareToken;
      return next();
    }
    if (!token) return next(new Error('Authentication required'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid token'));
    socket.data.userId = payload.sub;
    return next();
  });

  io.on('connection', (socket) => {
    socket.on('journey:subscribe', async (journeyId, ack) => {
      try {
        if (socket.data.userId) {
          const { rows } = await query('SELECT 1 FROM journeys WHERE id = $1 AND user_id = $2', [
            journeyId,
            socket.data.userId,
          ]);
          if (rows.length === 0) throw new Error('Journey not found for this user');
        } else {
          const { rows } = await query(
            `SELECT 1 FROM journeys
             WHERE id = $1 AND share_token = $2
               AND (share_expires_at IS NULL OR share_expires_at > now())`,
            [journeyId, socket.data.shareToken],
          );
          if (rows.length === 0) throw new Error('Share link is invalid or expired');
        }
        socket.join(journeyRoom(journeyId));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('journey:unsubscribe', (journeyId) => {
      socket.leave(journeyRoom(journeyId));
    });
  });

  return io;
}

/** Broadcast to everyone watching one journey. No-op before init (e.g. tests). */
export function emitJourneyUpdate(journeyId, event, payload) {
  io?.to(journeyRoom(journeyId)).emit(event, payload);
}

export function getIo() {
  return io;
}
