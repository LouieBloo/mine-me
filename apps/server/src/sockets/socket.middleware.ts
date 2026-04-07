import { Socket as IOSocket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

/**
 * Socket.io middleware that verifies the JWT token passed as a handshake auth parameter.
 * Sets socket.data.userId on success so handlers can trust it without re-reading from client.
 *
 * Usage on client: io(URL, { auth: { token: 'Bearer ...' } })
 */
export const socketAuthMiddleware = (socket: IOSocket, next: (err?: Error) => void) => {
  const authToken: string | undefined = socket.handshake.auth?.token;

  if (!authToken) {
    return next(new Error('Authentication error: No token provided'));
  }

  const token = authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    // Store userId on socket.data — never trust anything the CLIENT sends for identity
    socket.data.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid or expired token'));
  }
};
