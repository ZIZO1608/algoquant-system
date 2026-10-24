import dotenv from 'dotenv';
dotenv.config();

const DEV_JWT_SECRET = 'dev-secret';
const DEV_JWT_REFRESH_SECRET = 'dev-refresh-secret';
const DEV_BOOTSTRAP_ADMIN_PASSWORD = 'Admin123!';
const DEV_WEBHOOK_DEFAULT_SECRET = 'change-me-webhook-secret';

const env = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || DEV_JWT_REFRESH_SECRET;
const bootstrapAdminPassword =
  process.env.BOOTSTRAP_ADMIN_PASSWORD || DEV_BOOTSTRAP_ADMIN_PASSWORD;
const webhookDefaultSecret =
  process.env.WEBHOOK_DEFAULT_SECRET || DEV_WEBHOOK_DEFAULT_SECRET;

if (env === 'production') {
  const unsafe: string[] = [];
  if (!process.env.JWT_SECRET || jwtSecret === DEV_JWT_SECRET) unsafe.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET || jwtRefreshSecret === DEV_JWT_REFRESH_SECRET) {
    unsafe.push('JWT_REFRESH_SECRET');
  }
  if (
    !process.env.BOOTSTRAP_ADMIN_PASSWORD ||
    bootstrapAdminPassword === DEV_BOOTSTRAP_ADMIN_PASSWORD
  ) {
    unsafe.push('BOOTSTRAP_ADMIN_PASSWORD');
  }
  if (
    !process.env.WEBHOOK_DEFAULT_SECRET ||
    webhookDefaultSecret === DEV_WEBHOOK_DEFAULT_SECRET
  ) {
    unsafe.push('WEBHOOK_DEFAULT_SECRET');
  }
  if (unsafe.length) {
    throw new Error(
      `Refusing to start in production with insecure defaults: ${unsafe.join(', ')}`
    );
  }
}

export const config = {
  env,
  port: parseInt(process.env.PORT || '3001', 10),
  trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS || '1', 10),
  databaseUrl: process.env.DATABASE_URL!,
  jwt: {
    secret: jwtSecret,
    refreshSecret: jwtRefreshSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    // Address browsers use to download files. Behind a proxy the API reaches storage
    // internally (S3_ENDPOINT) while download links must point at the public host.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'algo-quant',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  bootstrap: {
    adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@algoquant.local',
    adminPassword: bootstrapAdminPassword,
  },
  webhookDefaultSecret,
};

/** CORS_ORIGIN may hold several origins separated by commas. */
export const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const PRIVATE_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

/**
 * Origin check shared by Express and Socket.IO.
 * Outside production, devices on the same private network (phones on the office Wi-Fi
 * opening http://<laptop-ip>:5173) are allowed without listing every address.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin, curl, server-to-server
  if (corsOrigins.includes(origin)) return true;
  if (config.env !== 'production' && PRIVATE_NETWORK_ORIGIN.test(origin)) return true;
  return false;
}

export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  callback(null, isAllowedOrigin(origin));
}

export const PRIVILEGE_CODES = [
  'admin',
  'sales',
  'media',
  'operation',
  'instructor',
  'accountant',
] as const;

export type PrivilegeCode = (typeof PRIVILEGE_CODES)[number];

export const LEAD_SOURCES = [
  { code: 'social_media', labelAr: 'سوشال ميديا' },
  { code: 'sales', labelAr: 'مبيعات' },
  { code: 'reference', labelAr: 'إحالة' },
  { code: 'bot', labelAr: 'بوت التأهيل' },
] as const;

export const EXPENSE_CATEGORIES = [
  { code: 'rent', labelAr: 'إيجار' },
  { code: 'utilities', labelAr: 'مرافق' },
  { code: 'marketing', labelAr: 'تسويق' },
  { code: 'salaries', labelAr: 'رواتب' },
  { code: 'supplies', labelAr: 'مستلزمات' },
  { code: 'other', labelAr: 'أخرى' },
] as const;

export const BOT_EXTRA_DATA_KEYS = [
  'interest_area',
  'main_goal',
  'repetitive_task',
  'lead_classification',
  'seriousness_level',
  'ready_to_register',
  'needs_a_call',
  'city',
  'occupation_type',
  'ai_experience_score',
  'preferred_contact_times',
  'preferred_contact_method',
  'recommendation_reason',
] as const;
