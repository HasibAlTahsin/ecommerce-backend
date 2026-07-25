import rateLimit from 'express-rate-limit';

// Strict limiter for auth routes — blunts brute-force / credential stuffing.
// 5 attempts per 15 minutes per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,   // send RateLimit-* headers so clients can back off
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// Looser global limiter — protects the API from general abuse.
// 100 requests per minute per IP.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
