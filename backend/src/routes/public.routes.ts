import { Router } from 'express';
import * as studentService from '../services/student.service.js';

const router = Router();

router.get('/evaluations/:token', async (req, res, next) => {
  try {
    const token = await studentService.getEvaluationByToken(String(req.params.token ?? ''));
    res.json({
      courseName: token.campaign.course.name,
      sessionNumber: token.campaign.session?.sessionNumber,
      studentName: token.student.fullName,
      type: token.campaign.type,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/evaluations/:token', async (req, res, next) => {
  try {
    res.status(201).json(
      await studentService.submitEvaluationViaToken(String(req.params.token ?? ''), req.body)
    );
  } catch (err) {
    next(err);
  }
});

export default router;
