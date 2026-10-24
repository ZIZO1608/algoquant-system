import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      paramId: (name?: string) => string;
    }
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function paramsMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.paramId = (name = 'id') => {
    const val = req.params[name];
    const id = Array.isArray(val) ? val[0] : (val ?? '');
    if (!id || !UUID_RE.test(id)) {
      throw new ValidationError(`Invalid ${name}: expected a UUID`);
    }
    return id;
  };
  next();
}
