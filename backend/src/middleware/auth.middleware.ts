import { Request, Response, NextFunction } from 'express';
import { PrivilegeCode } from '../config/index.js';
import { verifyAccessToken, JwtPayload, hasAnyPrivilege } from '../services/auth.service.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing authorization token'));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // ignore
    }
  }
  next();
}

export function requirePrivileges(...codes: PrivilegeCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!hasAnyPrivilege(req.user.privileges, codes)) {
      return next(new ForbiddenError('Insufficient privileges'));
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  return requirePrivileges('admin')(req, _res, next);
}
