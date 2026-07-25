import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

// Lazily create a transporter. In dev/test we use Ethereal — a fake SMTP
// service that captures the email and returns a preview URL, so no real
// credentials are needed. In production, set SMTP_* env vars for real SMTP
// (Gmail, SendGrid, etc.) and nothing else changes.
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    // Production path — real SMTP from environment.
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    // Dev/test path — Ethereal. Auto-creates a throwaway test inbox.
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[mailer] Using Ethereal test SMTP for email delivery');
  }

  return transporter;
}

export async function sendVerificationEmail(to: string, pin: string): Promise<void> {
  const tx = await getTransporter();
  const info = await tx.sendMail({
    from: '"E-Commerce" <no-reply@ecommerce.local>',
    to,
    subject: 'Your verification code',
    text: `Your verification code is ${pin}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <b>${pin}</b>.</p><p>It expires in 10 minutes.</p>`,
  });

  // Ethereal returns a preview URL where the email can be viewed in a browser.
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log('[mailer] Verification email preview URL:', preview);
}
