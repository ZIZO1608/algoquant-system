import { Router } from 'express';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as employeeService from '../services/employee.service.js';

const router = Router();
router.use(authenticate);

router.post('/', requirePrivileges('instructor'), async (req, res, next) => {
  try {
    res.status(201).json(
      await employeeService.submitAvailability(
        req.user!.sub,
        new Date(req.body.startsAt),
        new Date(req.body.endsAt),
        req.body.note
      )
    );
  } catch (err) {
    next(err);
  }
});

export default router;
