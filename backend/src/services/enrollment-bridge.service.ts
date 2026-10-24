import { prisma } from '../lib/prisma.js';
import { normalizeSearchText } from '../lib/crypto.js';
import { ConflictError } from '../lib/errors.js';

export async function createStudentFromLead(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;

  let student = await prisma.student.findFirst({
    where: { phone: lead.phone, deletedAt: null },
  });

  if (!student) {
    try {
      student = await prisma.student.create({
        data: {
          fullName: lead.fullName,
          phone: lead.phone,
          searchText: normalizeSearchText(lead.fullName, lead.phone),
        },
      });
    } catch (err) {
      // Race: another convert created the same phone — reuse
      student = await prisma.student.findFirst({
        where: { phone: lead.phone, deletedAt: null },
      });
      if (!student) {
        if (err instanceof ConflictError) throw err;
        throw err;
      }
    }
  }

  return student;
}
