import { Router } from 'express';
import { LeadStatus } from '@prisma/client';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as leadService from '../services/lead.service.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    const leads = await leadService.listLeads(
      {
        status: req.query.status as LeadStatus | undefined,
        sourceId: req.query.sourceId as string,
        assignedEmployeeId: req.query.assignedEmployeeId as string,
        search: req.query.search as string,
        interestArea: req.query.interestArea as string,
        leadClassification: req.query.leadClassification as string,
        readyToRegister: req.query.readyToRegister as string,
      },
      req.user!.privileges,
      req.user!.sub
    );
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    await leadService.assertLeadAccess(req.paramId(), req.user!.sub, req.user!.privileges);
    const lead = await leadService.getLead(req.paramId());
    res.json({
      ...lead,
      allowedTransitions: leadService.getLeadAllowedTransitions(lead.status),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    const lead = await leadService.createLead(req.body, 'employee', req.user!.sub);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    await leadService.assertLeadAccess(req.paramId(), req.user!.sub, req.user!.privileges);
    res.json(await leadService.updateLead(req.paramId(), req.body, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/follow-up', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    await leadService.assertLeadAccess(req.paramId(), req.user!.sub, req.user!.privileges);
    const raw = req.body?.nextFollowUpAt;
    const nextFollowUpAt =
      raw === null || raw === undefined || raw === ''
        ? null
        : new Date(raw);
    if (nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime())) {
      res.status(400).json({ error: 'Invalid nextFollowUpAt' });
      return;
    }
    res.json(await leadService.setLeadFollowUp(req.paramId(), nextFollowUpAt, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/transition', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    await leadService.assertLeadAccess(req.paramId(), req.user!.sub, req.user!.privileges);
    const { toStatus, reason } = req.body;
    res.json(await leadService.transitionLead(req.paramId(), toStatus, req.user!.sub, reason));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/assign', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    await leadService.assertLeadAccess(req.paramId(), req.user!.sub, req.user!.privileges);
    res.json(await leadService.assignLead(req.paramId(), req.body.employeeId, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/notes', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    await leadService.assertLeadAccess(req.paramId(), req.user!.sub, req.user!.privileges);
    res.status(201).json(await leadService.addLeadNote(req.paramId(), req.body.body, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

/** Enroll lead in a course and record first payment in one step. */
router.post(
  '/:id/convert-and-pay',
  requirePrivileges('admin', 'sales', 'operation', 'accountant'),
  async (req, res, next) => {
    try {
      const { courseId, amountMinor, method, note, totalPriceMinor } = req.body;
      res.status(201).json(
        await leadService.convertLeadWithPayment(
          req.paramId(),
          { courseId, amountMinor, method, note, totalPriceMinor },
          req.user!.sub,
          req.user!.privileges
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', requirePrivileges('admin'), async (req, res, next) => {
  try {
    await leadService.softDeleteLead(req.paramId(), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
