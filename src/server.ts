import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDb } from './config/db';
import { env } from './config/env';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import songRoutes from './routes/songs';
import resolverRoutes from './routes/resolver';
import listenTogetherRoutes from './routes/listen-together';
import listenSessionRoutes from './routes/listen-sessions';

async function bootstrap() {
  try {
    await connectDb();
    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('--- SERVER STARTUP CHECK ---');

  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(morgan('dev'));
  // Increase body size limit to 50MB for file uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // API routes
  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/songs', songRoutes);
  app.use('/', resolverRoutes);
  app.use('/listen-together', listenTogetherRoutes);
  app.use('/listen-sessions', listenSessionRoutes);

  app.listen(env.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://0.0.0.0:${env.port}`);
    // eslint-disable-next-line no-console
    console.log(`Access from network: http://<your-local-ip>:${env.port}`);
  });
}

void bootstrap();


