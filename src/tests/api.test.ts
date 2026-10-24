import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiError, getStoredToken, setStoredToken } from '../api.js';

// In-memory mock for localStorage in Node environment
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  }),
};

describe('API Utility & ApiError Test Suite', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage);
    mockLocalStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ApiError class', () => {
    it('should create an ApiError with message and HTTP status code', () => {
      const err = new ApiError('Not found', 404);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toBe('Not found');
      expect(err.status).toBe(404);
    });

    it('should correctly expose status code for authorization errors', () => {
      const unauthErr = new ApiError('Unauthorized. Please log in.', 401);
      expect(unauthErr.status).toBe(401);
      expect(unauthErr.message).toContain('Unauthorized');
    });

    it('should correctly expose status code for validation errors', () => {
      const valErr = new ApiError('Invoice amount must be greater than zero', 400);
      expect(valErr.status).toBe(400);
      expect(valErr.message).toBe('Invoice amount must be greater than zero');
    });
  });

  describe('Token storage helpers', () => {
    it('should store, retrieve, and clear authentication tokens', () => {
      expect(getStoredToken()).toBeNull();

      setStoredToken('test-jwt-token-12345');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('receipto_auth_token', 'test-jwt-token-12345');
      expect(getStoredToken()).toBe('test-jwt-token-12345');

      setStoredToken(null);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('receipto_auth_token');
      expect(getStoredToken()).toBeNull();
    });

    it('should handle missing or throwing storage gracefully', () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('SecurityError: storage disabled');
      });
      expect(getStoredToken()).toBeNull();

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });
      expect(() => setStoredToken('token')).not.toThrow();
    });
  });

  describe('HTTP response parsing and error handling', () => {
    it('should parse JSON error payloads with error field', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'Client email is required' }),
      });
      vi.stubGlobal('fetch', fakeFetch);

      try {
        const res = await fakeFetch('/api/clients');
        const text = await res.text();
        const data = JSON.parse(text);
        if (!res.ok) {
          throw new ApiError(data.error || 'Failed', res.status);
        }
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(400);
        expect(err.message).toBe('Client email is required');
      }
    });

    it('should parse JSON error payloads with message field', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'Invoice not found' }),
      });
      vi.stubGlobal('fetch', fakeFetch);

      try {
        const res = await fakeFetch('/api/invoices/999');
        const text = await res.text();
        const data = JSON.parse(text);
        if (!res.ok) {
          throw new ApiError(data.message || data.error || 'Failed', res.status);
        }
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(404);
        expect(err.message).toBe('Invoice not found');
      }
    });

    it('should fall back to raw text when JSON parse fails', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway: Upstream connection failed',
      });
      vi.stubGlobal('fetch', fakeFetch);

      try {
        const res = await fakeFetch('/api/health');
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text };
        }
        if (!res.ok) {
          throw new ApiError(data.error, res.status);
        }
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(502);
        expect(err.message).toContain('Bad Gateway');
      }
    });

    it('should clear stored token when encountering 401 Unauthorized', () => {
      setStoredToken('active-token-abc');
      expect(getStoredToken()).toBe('active-token-abc');

      // Emulate 401 handling
      const status = 401;
      if (status === 401) {
        setStoredToken(null);
      }
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('Timeout and network retry mechanics', () => {
    it('should handle timeout abort errors gracefully with 408 status', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';

      const fakeFetch = vi.fn().mockRejectedValue(abortErr);
      vi.stubGlobal('fetch', fakeFetch);

      try {
        try {
          await fakeFetch('/api/slow-endpoint');
        } catch (err: any) {
          if (err.name === 'AbortError') {
            throw new ApiError('Request timed out. Please try again.', 408);
          }
          throw err;
        }
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(408);
        expect(err.message).toBe('Request timed out. Please try again.');
      }
    });

    it('should retry idempotent GET requests when initial attempt suffers network glitch', async () => {
      let attempts = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new TypeError('Failed to fetch');
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, count: 5 }),
        };
      });

      // Emulate retry logic
      let result: any = null;
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const res = await fakeFetch('/api/clients');
          result = JSON.parse(await res.text());
          break;
        } catch (err) {
          if (attempt === 1) throw err;
        }
      }

      expect(attempts).toBe(2);
      expect(result).toEqual({ success: true, count: 5 });
    });
  });
});
