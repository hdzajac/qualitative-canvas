import { createServer } from 'http';
import { Server } from 'socket.io';
import { app, init } from './app.js';
import { setupCollab } from './services/collab.js';

const port = process.env.PORT || 5002;
const corsOrigin = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3000';

init()
  .then(() => {
    const httpServer = createServer(app);

    const io = new Server(httpServer, {
      cors: { origin: corsOrigin, credentials: true },
      path: '/socket.io',
    });

    setupCollab(io);

    httpServer.listen(port, () => console.log(`Backend listening on port ${port}`));
  })
  .catch((e) => {
    console.error('Startup failed', e);
    process.exit(1);
  });
