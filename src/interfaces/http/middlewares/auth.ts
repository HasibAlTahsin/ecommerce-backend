import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';

export interface AuthenticatedRequest extends Request {
  user?: { userId: bigint; role: string };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.substring('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string };
    req.user = { userId: BigInt(payload.userId), role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
