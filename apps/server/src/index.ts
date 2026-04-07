import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { charactersRouter } from './routes/characters';
import { publicRouter } from './routes/public';
import { gameRouter } from './routes/game';
import { handleSocketConnection } from './sockets/handlers';
import { socketAuthMiddleware } from './sockets/socket.middleware';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
export const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/assets', express.static(path.join(__dirname, '../../../packages/shared/assets')));

// API Routes
app.use('/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/public', publicRouter);
app.use('/api/game', gameRouter);

app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'NVG Server is running healthy.' });
});

// Real-Time Socket Connections
io.use(socketAuthMiddleware);
io.on('connection', (socket: any) => {
  handleSocketConnection(io, socket);
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`🚀 NVG Server started on port ${PORT}`);
});
