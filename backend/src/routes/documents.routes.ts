import { Router } from 'express';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as documentService from '../services/document.service.js';
import { NotFoundError } from '../lib/errors.js';

/** Data for printable receipts, vouchers and statements (see document.service). */
const router = Router();
router.use(authenticate);

router.get(
  '/payment/:id',
  requirePrivileges('admin', 'operation', 'accountant', 'sales'),
  async (req, res, next) => {
    try {
      res.json(await documentService.getPaymentDocument(req.paramId()));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/expense/:id', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await documentService.getExpenseDocument(req.paramId()));
  } catch (err) {
    next(err);
  }
});

router.get('/refund/:id', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await documentService.getRefundDocument(req.paramId()));
  } catch (err) {
    next(err);
  }
});

router.get('/owner_withdrawal/:id', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.json(await documentService.getOwnerWithdrawalDocument(req.paramId()));
  } catch (err) {
    next(err);
  }
});

// Any signed-in employee: the service lets finance staff print all, others only their own.
router.get('/wallet_withdrawal/:id', async (req, res, next) => {
  try {
    res.json(
      await documentService.getWalletWithdrawalDocument(req.paramId(), {
        id: req.user!.sub,
        privileges: req.user!.privileges,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get(
  '/statement/:id',
  requirePrivileges('admin', 'operation', 'accountant', 'sales'),
  async (req, res, next) => {
    try {
      res.json(await documentService.getStudentStatement(req.paramId()));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/numbering', requirePrivileges('admin'), async (_req, res, next) => {
  try {
    res.json(await documentService.getNumbering());
  } catch (err) {
    next(err);
  }
});

router.put('/numbering/:type', requirePrivileges('admin'), async (req, res, next) => {
  try {
    const type = String(req.params.type ?? '');
    if (!documentService.isNumberedDocument(type)) throw new NotFoundError('Document type not found');
    res.json(await documentService.setNextNumber(type, Number(req.body.next), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

export default router;
