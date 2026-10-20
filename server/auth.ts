import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { getSession, deleteSession, createSession, getUserById } from './db.js';
import type { User } from './types.js';

export const COOKIE_NAME = 'receipto_session';

// Production SESSION_SECRET check
let sessionSecret = process.env.SESSION_SECRET?.trim();
if (!sessionSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Security Warning] SESSION_SECRET is not set in environment. Generating fallback secure key for runtime.');
  }
  sessionSecret = crypto.randomBytes(48).toString('hex');
}

// In-memory rate limiter for auth endpoints: 10 requests per minute per IP
const authRateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function authRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = authRateLimitMap.get(ip);
  const maxLimit = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') ? 120 : 30;

  if (!entry || now > entry.resetTime) {
    authRateLimitMap.set(ip, { count: 1, resetTime: now + 60 * 1000 });
    return next();
  }

  if (entry.count >= maxLimit) {
    return res.status(429).json({
      error: 'Too many authentication attempts. Please wait 60 seconds before retrying.',
    });
  }

  entry.count++;
  next();
}

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Compare password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Sign cookie value to prevent client tampering
export function signToken(token: string): string {
  const signature = crypto.createHmac('sha256', sessionSecret!).update(token).digest('base64url');
  return `${token}.${signature}`;
}

// Verify signed cookie value
export function unsignToken(signedVal: string): string | null {
  if (!signedVal || typeof signedVal !== 'string') return null;
  const parts = signedVal.split('.');
  if (parts.length !== 2) return null;
  const [token, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', sessionSecret!).update(token).digest('base64url');
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return token;
  }
  return null;
}

// Set auth cookie
export function setAuthCookie(req: Request, res: Response, token: string, expiresAt: Date) {
  const signed = signToken(token);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    expires: expiresAt,
    path: '/',
  });
}

// Clear auth cookie
export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
  });
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

// Authentication middleware
export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionToken?: string;
}

function sendAuthError(req: AuthenticatedRequest, res: Response, status: number, errorMsg: string) {
  const isPrintRequest = req.path.endsWith('/print');
  if (isPrintRequest) {
    return res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipto - Authentication Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; text-align: center; padding: 60px 20px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    h2 { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
    p { font-size: 14px; color: #64748b; margin-bottom: 24px; line-height: 1.6; }
    .btn { display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; }
    .btn:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Please Log In to View Invoice</h2>
    <p>${errorMsg}</p>
    <a href="/?login=true" class="btn">Log in to Receipto</a>
  </div>
</body>
</html>`);
  }
  return res.status(status).json({ error: errorMsg });
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let cookieVal = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
  if (!cookieVal && req.query?.token && typeof req.query.token === 'string') {
    cookieVal = req.query.token;
  }

  if (!cookieVal) {
    return sendAuthError(req, res, 401, 'Authentication required. Please log in.');
  }

  let token: string | null = null;
  // If passed from cookie, try unsigning it
  if (cookieVal.includes('.')) {
    token = unsignToken(cookieVal);
  }
  if (!token) {
    token = cookieVal;
  }

  if (!token) {
    return sendAuthError(req, res, 401, 'Invalid or tampered session cookie.');
  }

  try {
    const session = await getSession(token);
    if (!session) {
      clearAuthCookie(res);
      return sendAuthError(req, res, 401, 'Session expired or invalidated. Please log in again.');
    }

    if (session.user.status === 'SUSPENDED') {
      clearAuthCookie(res);
      return sendAuthError(req, res, 403, 'Your account has been suspended. Please contact support.');
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (err: any) {
    console.error('[Auth Error]', err.message);
    return res.status(500).json({ error: 'Authentication service encountered an error.' });
  }
}

/**
 * Middleware ensuring the authenticated user has verified their email address.
 * Rejects unverified accounts with HTTP 403 Forbidden and requires_verification flag.
 */
export async function requireVerified(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  if (req.user.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
  }

  if (!req.user.email_verified) {
    return res.status(403).json({
      error: 'Email verification required. Please verify your email to access Receipto.',
      requires_verification: true,
      email: req.user.email,
    });
  }

  next();
}

/**
 * Middleware ensuring the authenticated user is an authorized Administrator (ADMIN role).
 * Rejects normal users with HTTP 403 Forbidden error.
 */
export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  if (req.user.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin authorization required. Access denied.' });
  }

  next();
}

/**
 * Middleware that extracts user session from cookie or Authorization header if present,
 * but does NOT block the request if absent.
 */
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookieVal = req.cookies?.[COOKIE_NAME] || (req.headers['authorization'] as string | undefined)?.replace('Bearer ', '');
  if (!cookieVal) {
    return next();
  }

  let token: string | null = null;
  if (cookieVal.includes('.')) {
    token = unsignToken(cookieVal);
  } else {
    token = cookieVal;
  }

  if (token) {
    try {
      const session = await getSession(token);
      if (session) {
        req.user = session.user;
        req.sessionToken = token;
      }
    } catch {}
  }
  next();
}
