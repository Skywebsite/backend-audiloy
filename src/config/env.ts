import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshJwtSecret: process.env.REFRESH_JWT_SECRET || '',
  refreshJwtExpiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '30d',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
};

if (!env.mongoUri) {
  // eslint-disable-next-line no-console
  console.warn('MONGO_URI is not set');
}


