import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userId?: string;
}

const accessTokenOptions: SignOptions = {
  expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
};

const refreshTokenOptions: SignOptions = {
  expiresIn: env.refreshJwtExpiresIn as SignOptions['expiresIn'],
};

export function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret as Secret, accessTokenOptions);
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId }, env.refreshJwtSecret as Secret, refreshTokenOptions);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = auth.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}


