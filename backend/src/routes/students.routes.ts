import { Router } from 'express';
import { AttendanceStatus } from '@prisma/client';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as studentService from '../services/student.service.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(authenticate);

// Accountants take payments and print receipts, so they read students too.
router.get('/', requirePrivileges('admin', 'operation', 'sales', 'accountant'), async (req, res, next) => {
  try {
    res.json(await studentService.listStudents(req.query.search as string));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePrivileges('admin', 'operation', 'sales', 'accountant'), async (req, res, next) => {
  try {
    res.json(await studentService.getStudent(req.paramId()));
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    res.status(201).json(await studentService.createStudent(req.body));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    res.json(await studentService.updateStudent(req.paramId(), req.body));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    res.json(
      await studentService.setStudentStatus(req.paramId(), req.body.status, req.user!.sub, req.body.reason)
    );
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePrivileges('admin'), async (req, res, next) => {
  try {
    await studentService.softDeleteStudent(req.paramId(), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/enrollments/:id/transition', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    res.json(await studentService.transitionEnrollment(req.paramId(), req.body.toStatus, req.user!.sub, req.body.reason));
  } catch (err) {
    next(err);
  }
});

router.post('/enrollments/:id/payments', requirePrivileges('admin', 'operation', 'accountant'), async (req, res, next) => {
  try {
    res.status(201).json(
      await studentService.recordPayment(
        req.paramId(),
        toMinor(req.body.amountMinor),
        req.user!.sub,
        req.body.method,
        req.body.note
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/payments/:id/void', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await studentService.voidPayment(req.paramId(), req.user!.sub, req.body.reason));
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:sessionId/attendance', requirePrivileges('admin', 'operation', 'instructor'), async (req, res, next) => {
  try {
    const records = req.body.records as { studentId: string; status: AttendanceStatus }[];
    res.json(
      await studentService.recordAttendance(
        req.paramId('sessionId'),
        records,
        req.user!.sub,
        req.user!.privileges
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/enrollments/:id/certificates', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    res.status(201).json(await studentService.issueCertificate(req.paramId(), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/enrollments/:id/certificates/reissue',
  requirePrivileges('admin', 'operation'),
  async (req, res, next) => {
    try {
      res.status(201).json(await studentService.reissueCertificate(req.paramId(), req.user!.sub));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/enrollments/:id/evaluations', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    res.status(201).json(
      await studentService.submitEvaluationViaStaff(req.paramId(), req.body, req.user!.sub)
    );
  } catch (err) {
    next(err);
  }
});

export default router;
