import dotenv from 'dotenv';
import { app, init } from './app.js';

dotenv.config();

const port = process.env.PORT || 5002;

init()
  .then(() => app.listen(port, () => console.log(`Backend listening on port ${port}`)))
  .catch((e) => {
    console.error('Startup failed', e);
    process.exit(1);
  });
