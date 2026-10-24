/**
 * Student status: the overall standing (Student.status) and the per-course steps
 * (Enrollment.enrollmentStatus). Labels and help texts are Arabic source text; translate them
 * when rendering. The backend owns the rules (transitions.ts, student.service.ts).
 */

export const STUDENT_STATUSES = ['active', 'frozen', 'graduated', 'withdrawn', 'blocked'];

export const STUDENT_STATUS_HELP = {
  active: 'يدرس حالياً أو يمكن تسجيله في دورات جديدة.',
  frozen: 'أوقف دراسته مؤقتاً (سفر، ظرف صحي…). يعود «نشطاً» تلقائياً عند تسجيله في دورة.',
  graduated: 'أنهى مساره التدريبي في الأكاديمية.',
  withdrawn: 'ترك الأكاديمية. يعود «نشطاً» تلقائياً إذا سُجّل في دورة جديدة.',
  blocked: 'لا يمكن تسجيله في أي دورة جديدة حتى تُرفع هذه الحالة.',
};

/** Statuses that take a student out of normal activity need a written reason (backend rule too). */
export const STATUS_NEEDS_REASON = new Set(['frozen', 'withdrawn', 'blocked']);

/** The normal path of one course enrollment; "dropped" leaves it. */
export const ENROLLMENT_STEPS = ['enrolled', 'attending', 'completed', 'certified'];

/** A manual step, described by where it goes (and, for undo, where it comes from). */
export function enrollmentAction(from, to) {
  if (from === 'completed' && to === 'attending') {
    return { label: 'التراجع عن الإكمال', help: 'يعيده إلى «يحضر» إذا سُجّل الإكمال بالخطأ.', tone: 'neutral' };
  }
  switch (to) {
    case 'attending':
      return { label: 'بدء الحضور', help: 'بدأ حضور الجلسات. يحدث تلقائياً عند تسجيل أول حضور له.', tone: 'brand' };
    case 'completed':
      return {
        label: 'إكمال الدورة',
        help: 'أنهى الدورة. يحدث تلقائياً لمن يحضر عند اكتمال الدورة، ويسمح بإصدار الشهادة.',
        tone: 'success',
      };
    case 'dropped':
      return { label: 'تسجيل انسحاب', help: 'انسحب من هذه الدورة ويُحرَّر مقعده. يلزم كتابة السبب.', tone: 'danger' };
    case 'enrolled':
      return { label: 'إعادة التسجيل', help: 'يعيده إلى الدورة ويحجز له مقعداً من جديد.', tone: 'brand' };
    default:
      return { label: to, help: '', tone: 'neutral' };
  }
}

/** The one step staff take next on an enrollment, or null. */
export function nextEnrollmentStep(enrollment) {
  const allowed = enrollment.allowedTransitions || [];
  switch (enrollment.enrollmentStatus) {
    case 'enrolled':
      return allowed.includes('attending') ? 'attending' : null;
    case 'attending':
      return allowed.includes('completed') ? 'completed' : null;
    case 'completed':
      return 'certify';
    case 'dropped':
      return allowed.includes('enrolled') ? 'enrolled' : null;
    default:
      return null;
  }
}

/** Open refunds hold money back; processed ones are already out of amountPaidMinor. */
export function refundableAmount(enrollment) {
  const paid = Number(enrollment.amountPaidMinor ?? 0);
  const open = (enrollment.refunds || [])
    .filter((r) => ['initiated', 'under_review', 'approved'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.amountMinor ?? 0), 0);
  return Math.max(0, paid - open);
}

export function attendanceRate(stats) {
  if (!stats?.total) return null;
  return Math.round(((stats.present + stats.late) / stats.total) * 100);
}
