import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requirePrivileges } from '../middleware/auth.middleware.js';
import * as employeeService from '../services/employee.service.js';
import { hasAnyPrivilege } from '../services/auth.service.js';
import { PrivilegeCode } from '../config/index.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(authenticate);

/** Admin: full HR list. Other staff: safe directory for assign/chat pickers. */
router.get('/', async (req, res, next) => {
  try {
    const isAdmin = hasAnyPrivilege(req.user!.privileges, ['admin']);
    res.json(
      isAdmin
        ? await employeeService.listEmployees()
        : await employeeService.listEmployeeDirectory()
    );
  } catch (err) {
    next(err);
  }
});

router.get('/ratings', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await employeeService.getRatingsLeaderboard());
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAdmin, async (req, res, next) => {
  try {
    res.json(await employeeService.getEmployee(req.paramId()));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.monthlySalaryMinor != null && body.monthlySalaryMinor !== '') {
      body.monthlySalaryMinor = toMinor(body.monthlySalaryMinor);
    }
    const emp = await employeeService.createEmployee(body, req.user!.sub);
    res.status(201).json(emp);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.monthlySalaryMinor != null && body.monthlySalaryMinor !== '') {
      body.monthlySalaryMinor = toMinor(body.monthlySalaryMinor);
    }
    res.json(await employeeService.updateEmployee(req.paramId(), body, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await employeeService.softDeleteEmployee(req.paramId(), req.user!.sub, {
      reassignToId: req.body?.reassignToId,
      confirmOrphan: Boolean(req.body?.confirmOrphan),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/privileges', requireAdmin, async (req, res, next) => {
  try {
    const { privilegeCodes } = req.body as { privilegeCodes: PrivilegeCode[] };
    res.json(await employeeService.setEmployeePrivileges(req.paramId(), privilegeCodes, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/absences', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    const { year, month } = req.query;
    res.json(
      await employeeService.getAbsences(
        req.paramId(),
        year ? parseInt(year as string) : undefined,
        month ? parseInt(month as string) : undefined
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/absences', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const { date, reason } = req.body;
    res.status(201).json(
      await employeeService.markAbsence(req.paramId(), new Date(date), reason, req.user!.sub)
    );
  } catch (err) {
    next(err);
  }
});

export default router;
