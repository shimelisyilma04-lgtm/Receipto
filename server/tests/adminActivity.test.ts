import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { router } from '../routes.js';
import { setUserEmailVerified, updateUserRole } from '../db.js';

let server: Server;
let baseUrl: string;

async function testRequest(
  path: string,
  options: { method?: string; body?: any; token?: string; cookie?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => '');
  }

  const setCookieHeader = res.headers.get('set-cookie');
  let cookie = '';
  if (setCookieHeader) {
    cookie = setCookieHeader.split(';')[0];
  }

  return { status: res.status, data, cookie };
}

describe('Admin & Activity Routes Integration Suite', () => {
  let regularToken: string;
  let regularCookie: string;
  let regularUserId: string;

  let adminToken: string;
  let adminCookie: string;
  let adminUserId: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Register normal user
    const regRes1 = await testRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: `reg_user_${Date.now()}@example.com`,
        password: 'Password123!',
        name: 'Regular User',
        terms_accepted: true,
      },
    });
    regularToken = regRes1.data.token;
    regularCookie = regRes1.cookie;
    regularUserId = regRes1.data.user.id;
    await setUserEmailVerified(regularUserId, true);

    // Register admin user
    const regRes2 = await testRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: `admin_user_${Date.now()}@example.com`,
        password: 'Password123!',
        name: 'Admin User',
        terms_accepted: true,
      },
    });
    adminToken = regRes2.data.token;
    adminCookie = regRes2.cookie;
    adminUserId = regRes2.data.user.id;
    await setUserEmailVerified(adminUserId, true);
    await updateUserRole(adminUserId, adminUserId, 'ADMIN');
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Activity & Profile Endpoints', () => {
    it('GET /api/activity retrieves user audit trail', async () => {
      const res = await testRequest('/api/activity', {
        method: 'GET',
        token: regularToken,
        cookie: regularCookie,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.logs)).toBe(true);
    });

    it('GET /api/dashboard calculates dashboard statistics', async () => {
      const res = await testRequest('/api/dashboard', {
        method: 'GET',
        token: regularToken,
        cookie: regularCookie,
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('stats');
    });

    it('POST /api/settings/profile updates user business profile', async () => {
      const res = await testRequest('/api/settings/profile', {
        method: 'POST',
        token: regularToken,
        cookie: regularCookie,
        body: {
          name: 'Updated Merchant',
          business_name: 'Alpha LLC',
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.message).toContain('Profile updated');
      expect(res.data.user.name).toBe('Updated Merchant');
    });

    it('GET /api/settings/config retrieves system configuration', async () => {
      const res = await testRequest('/api/settings/config', {
        method: 'GET',
        token: regularToken,
        cookie: regularCookie,
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('database');
    });
  });

  describe('Admin Control & System Dashboard', () => {
    it('rejects unauthenticated requests to admin dashboard with 401', async () => {
      const res = await testRequest('/api/admin/dashboard');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin requests to admin dashboard with 403 Forbidden', async () => {
      const res = await testRequest('/api/admin/dashboard', {
        token: regularToken,
        cookie: regularCookie,
      });
      expect(res.status).toBe(403);
    });

    it('allows admin user to access admin dashboard stats', async () => {
      const res = await testRequest('/api/admin/dashboard', {
        token: adminToken,
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('total_users');
      expect(res.data).toHaveProperty('active_users');
    });

    it('allows admin to query user list with filtering', async () => {
      const res = await testRequest('/api/admin/users?limit=10', {
        token: adminToken,
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.users)).toBe(true);
      expect(res.data.total).toBeGreaterThan(0);
    });

    it('allows admin to suspend and restore a user account', async () => {
      const suspendRes = await testRequest(`/api/admin/users/${regularUserId}/suspend`, {
        method: 'POST',
        token: adminToken,
        cookie: adminCookie,
      });
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.data.success).toBe(true);

      const restoreRes = await testRequest(`/api/admin/users/${regularUserId}/restore`, {
        method: 'POST',
        token: adminToken,
        cookie: adminCookie,
      });
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.data.success).toBe(true);
    });

    it('allows admin to view system health diagnostics', async () => {
      const res = await testRequest('/api/admin/system', {
        token: adminToken,
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('database');
      expect(res.data).toHaveProperty('worker');
    });

    it('allows admin to trigger manual worker reminder cycle', async () => {
      const res = await testRequest('/api/admin/system/trigger-worker', {
        method: 'POST',
        token: adminToken,
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });
  });
});
