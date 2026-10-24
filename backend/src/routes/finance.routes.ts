import { Router } from 'express';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as financeService from '../services/finance.service.js';
import { ValidationError } from '../lib/errors.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(authenticate);

function periodParam(req: { params: { period?: string } }) {
  const period = req.params.period;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new ValidationError('Invalid period: expected YYYY-MM');
  }
  return period;
}

router.get('/expenses', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(
      await financeService.listExpenses({
        categoryId: req.query.categoryId as string,
        courseId: req.query.courseId as string,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/payments', requirePrivileges('admin', 'accountant'), async (_req, res, next) => {
  try {
    res.json(await financeService.listPayments());
  } catch (err) {
    next(err);
  }
});

router.post('/expenses', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.status(201).json(
      await financeService.createExpense({
        categoryId: req.body.categoryId,
        amountMinor: toMinor(req.body.amountMinor),
        reason: req.body.reason,
        courseId: req.body.courseId,
        spentAt: new Date(req.body.spentAt),
        createdById: req.user!.sub,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.delete('/expenses/:id', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    await financeService.softDeleteExpense(req.paramId(), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/owner-withdrawals', requirePrivileges('admin'), async (_req, res, next) => {
  try {
    res.json(await financeService.listOwnerWithdrawals());
  } catch (err) {
    next(err);
  }
});

router.post('/owner-withdrawals', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.status(201).json(
      await financeService.createOwnerWithdrawal({
        amountMinor: toMinor(req.body.amountMinor),
        reason: req.body.reason,
        spentAt: new Date(req.body.spentAt),
        createdById: req.user!.sub,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/profit-share/:period', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await financeService.getProfitShareRun(periodParam(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/profit-share/:period/compute', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await financeService.computeStakeholderProfitShare(periodParam(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/profit-share/:period/approve', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await financeService.approveStakeholderProfitShare(periodParam(req), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/profit-share/:period/reject', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await financeService.rejectStakeholderProfitShare(periodParam(req), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

export default router;
