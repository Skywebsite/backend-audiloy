import mongoose from 'mongoose';
import { env } from './env';

export async function connectDb() {
  if (!env.mongoUri) {
    throw new Error('MONGO_URI is not configured');
  }

  await mongoose.connect(env.mongoUri);
}


