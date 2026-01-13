import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDb } from '../src/config/db';
import authRouter from '../src/routes/auth';
import usersRouter from '../src/routes/users';
import songsRouter from '../src/routes/songs';

const app = express();

// Initialize database connection
connectDb().catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

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
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/songs', songsRouter);

// Export the app for Vercel serverless
export default app;
