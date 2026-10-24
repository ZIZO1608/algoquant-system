import { Request } from 'express';

export function paramId(req: Request, name = 'id'): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}
