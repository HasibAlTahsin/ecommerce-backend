import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),

  STRIPE_ENABLED: z.coerce.boolean().default(false),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  BKASH_ENABLED: z.coerce.boolean().default(false),
  BKASH_BASE_URL: z.string().url().optional(),
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),

  MOCK_PAYMENTS_ENABLED: z.coerce.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.STRIPE_ENABLED && (!v.STRIPE_SECRET_KEY || !v.STRIPE_WEBHOOK_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'STRIPE_ENABLED=true requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET',
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
