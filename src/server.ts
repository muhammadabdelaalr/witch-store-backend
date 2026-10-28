import 'dotenv/config';
import { createApp } from './app';
import { validateRuntimeEnvironment } from './config/env';

validateRuntimeEnvironment();

const app = createApp();
const port = Number(process.env.PORT) || 3000;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(JSON.stringify({ level: 'info', event: 'server_started', port }));
  });
}

export default app;
