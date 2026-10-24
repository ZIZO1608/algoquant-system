import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDashboard } from '../services/dashboard.service.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(await getDashboard(req.user!.sub, req.user!.privileges));
  } catch (err) {
    next(err);
  }
});

export default router;
