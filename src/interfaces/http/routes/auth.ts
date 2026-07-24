import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../infrastructure/prisma/client';
import { env } from '../../../config/env';

export const authRouter = Router();

// Checking @gmail.com only for new customer registrations
const registerSchema = z.object({
email: z.string().email().refine(email => email.toLowerCase().endsWith('@gmail.com'), {
message: 'Only @gmail.com email addresses are allowed for registration.',
}),
password: z.string().min(8),
});

// Any valid email is acceptable during login (for Admin or Staff)
const loginSchema = z.object({
email: z.string().email(),
password: z.string().min(8),
});

authRouter.post('/register', async (req, res, next) => { 
try { 
const { email, password } = registerSchema.parse(req.body); 
const passwordHash = await argon2.hash(password); 

const user = await prisma.user.create({ 
data: { email, passwordHash }, 
}); 

res.status(201).json({ id: user.publicId, email: user.email }); 
} catch (err: any) { 
if (err.code === 'P2002' && err.meta?.target?.includes('email')) { 
return res.status(409).json({ error: 'Email already exists. Please login.' }); 
} 
if (err.name === 'ZodError') { 
return res.status(400).json({ error: err.issues[0].message }); 
} 
next(err); 
}
});

authRouter.post('/login', async (req, res, next) => { 
try { 
const { email, password } = loginSchema.parse(req.body); 
const user = await prisma.user.findUnique({ where: { email } }); 

if (!user || !(await argon2.verify(user.passwordHash, password))) { 
return res.status(401).json({ error: 'Invalid credentials' }); 
} 

const token = jwt.sign({ userId: String(user.id), role: user.role }, env.JWT_SECRET, { 
expiresIn: env.JWT_EXPIRES_IN as any, 
}); 

res.json({ token }); 
} catch (err: any) { 
if (err.name === 'ZodError') { 
return res.status(400).json({ error: err.issues[0].message }); 
}
next(err);
}
});
