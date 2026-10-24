import { Router } from 'express';
import { RefundStatus } from '@prisma/client';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as walletService from '../services/wallet.service.js';
import { prisma } from '../lib/prisma.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(authenticate);

router.get('/me', async (req, res, next) => {
  try {
    const wallet = await walletService.getOrCreateWallet(req.user!.sub);
    const transactions = await walletService.getWalletTransactions(wallet.id);
    const employee = await prisma.employee.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        fullName: true,
        isSalaried: true,
        monthlySalaryMinor: true,
      },
    });
    const myAdvances = await walletService.listSalaryAdvances({ employeeId: req.user!.sub });
    res.json({ wallet, transactions, employee, advances: myAdvances });
  } catch (err) {
    next(err);
  }
});

router.get('/', requirePrivileges('admin', 'accountant'), async (_req, res, next) => {
  try {
    res.json(await walletService.listWallets());
  } catch (err) {
    next(err);
  }
});

router.get('/advances/pending', requirePrivileges('admin', 'accountant'), async (_req, res, next) => {
  try {
    res.json(await walletService.listSalaryAdvances({ status: 'requested' }));
  } catch (err) {
    next(err);
  }
});

router.get('/advances', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    res.json(await walletService.listSalaryAdvances(status ? { status } : undefined));
  } catch (err) {
    next(err);
  }
});

router.post('/advances', async (req, res, next) => {
  try {
    res.status(201).json(
      await walletService.requestSalaryAdvance(req.user!.sub, toMinor(req.body.amountMinor))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/advances/:id/transition', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    const toStatus = req.body.toStatus as 'approved' | 'rejected';
    if (toStatus !== 'approved' && toStatus !== 'rejected') {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'toStatus must be approved or rejected' },
      });
    }
    res.json(await walletService.transitionSalaryAdvance(req.paramId(), toStatus, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.get('/withdrawals/pending', requirePrivileges('admin', 'accountant'), async (_req, res, next) => {
  try {
    const pending = await prisma.walletWithdrawalRequest.findMany({
      where: { status: { in: ['requested', 'under_review', 'approved'] } },
      include: {
        wallet: { include: { owner: { select: { id: true, fullName: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(pending);
  } catch (err) {
    next(err);
  }
});

router.post('/withdrawals', async (req, res, next) => {
  try {
    res.status(201).json(
      await walletService.requestWithdrawal(
        req.user!.sub,
        toMinor(req.body.amountMinor),
        req.body.reason,
        req.user!.sub
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/withdrawals/:id/transition', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await walletService.transitionWithdrawal(req.paramId(), req.body.toStatus, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

// Registered before /:ownerId so "refunds" is not read as an owner id.
router.get('/refunds', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    const status = req.query.status as RefundStatus;
    res.json(
      await walletService.listRefunds({
        status: Object.values(RefundStatus).includes(status) ? status : undefined,
        studentId: (req.query.studentId as string) || undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:ownerId', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    const ownerId = req.paramId('ownerId');
    const wallet = await walletService.getOrCreateWallet(ownerId);
    const transactions = await walletService.getWalletTransactions(wallet.id);
    const employee = await prisma.employee.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        fullName: true,
        email: true,
        isSalaried: true,
        monthlySalaryMinor: true,
      },
    });
    const advances = await walletService.listSalaryAdvances({ employeeId: ownerId });
    res.json({ wallet, transactions, employee, advances });
  } catch (err) {
    next(err);
  }
});

router.post('/refunds', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.status(201).json(
      await walletService.initiateRefund(
        req.body.enrollmentId,
        toMinor(req.body.amountMinor),
        req.body.reason,
        req.user!.sub,
        req.body.sessionId
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/refunds/:id/transition', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await walletService.transitionRefund(req.paramId(), req.body.toStatus, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

export default router;
