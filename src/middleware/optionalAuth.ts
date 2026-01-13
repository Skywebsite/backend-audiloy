import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthRequest } from './auth';

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        // No token provided, proceed as guest (no userId)
        return next();
    }

    const token = auth.slice('Bearer '.length);

    try {
        const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
        req.userId = payload.sub;
        return next();
    } catch {
        // Token exists but is invalid.
        // We can either ignore it (guest) or return 401.
        // Returning 401 helps the client know their session is stale.
        return res.status(401).json({ message: 'Invalid token' });
    }
}
