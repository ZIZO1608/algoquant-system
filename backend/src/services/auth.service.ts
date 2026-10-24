import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config, PrivilegeCode } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../lib/crypto.js';
import { UnauthorizedError, NotFoundError } from '../lib/errors.js';

export interface JwtPayload {
  sub: string;
  email: string;
  privileges: PrivilegeCode[];
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] });
}

export function signRefreshToken(employeeId: string): string {
  return jwt.sign(
    { sub: employeeId, jti: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function verifyRefreshToken(token: string): { sub: string } {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as { sub: string };
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

export async function getEmployeePrivileges(employeeId: string): Promise<PrivilegeCode[]> {
  const rows = await prisma.employeePrivilege.findMany({
    where: { employeeId },
    include: { privilege: true },
  });
  return rows.map((r) => r.privilege.code as PrivilegeCode);
}

export async function login(email: string, password: string) {
  const employee = await prisma.employee.findFirst({
    where: { email, deletedAt: null, isActive: true },
  });
  if (!employee) throw new UnauthorizedError('Invalid credentials');

  const valid = await verifyPassword(password, employee.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const privileges = await getEmployeePrivileges(employee.id);
  const payload: JwtPayload = { sub: employee.id, email: employee.email, privileges };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(employee.id);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      employeeId: employee.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    employee: {
      id: employee.id,
      email: employee.email,
      fullName: employee.fullName,
      privileges,
    },
  };
}

export async function revokeAllRefreshTokens(employeeId: string) {
  await prisma.refreshToken.updateMany({
    where: { employeeId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function refresh(refreshToken: string) {
  const decoded = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  // Reuse detection: presenting an already-rotated token revokes the whole session family.
  const reused = await prisma.refreshToken.findFirst({
    where: {
      employeeId: decoded.sub,
      tokenHash,
      revokedAt: { not: null },
    },
  });
  if (reused) {
    await revokeAllRefreshTokens(decoded.sub);
    throw new UnauthorizedError('Refresh token reuse detected');
  }

  const stored = await prisma.refreshToken.findFirst({
    where: {
      employeeId: decoded.sub,
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!stored) throw new UnauthorizedError('Refresh token revoked or expired');

  const employee = await prisma.employee.findFirst({
    where: { id: decoded.sub, deletedAt: null, isActive: true },
  });
  if (!employee) throw new NotFoundError('Employee not found');

  const privileges = await getEmployeePrivileges(employee.id);
  const payload: JwtPayload = { sub: employee.id, email: employee.email, privileges };
  const accessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(employee.id);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        employeeId: employee.id,
        tokenHash: hashToken(newRefreshToken),
        expiresAt,
      },
    }),
  ]);

  return { accessToken, refreshToken: newRefreshToken, privileges };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: {
      privileges: { include: { privilege: true } },
      wallet: true,
    },
  });
  if (!employee) throw new NotFoundError('Employee not found');

  const privileges = employee.privileges.map((p) => p.privilege.code as PrivilegeCode);
  return {
    id: employee.id,
    email: employee.email,
    fullName: employee.fullName,
    phone: employee.phone,
    isSalaried: employee.isSalaried,
    privileges,
    walletBalance: employee.wallet?.balanceMinor?.toString() ?? '0',
  };
}

export function hasPrivilege(privileges: PrivilegeCode[], required: PrivilegeCode[]): boolean {
  if (privileges.includes('admin')) return true;
  return required.some((p) => privileges.includes(p));
}

export function hasAnyPrivilege(privileges: PrivilegeCode[], required: PrivilegeCode[]): boolean {
  return hasPrivilege(privileges, required);
}
