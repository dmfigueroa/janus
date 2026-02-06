import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFromTMDB } from './tmdb-api';

// Mock fetch globally
const fetchMock = vi.fn() as unknown as typeof fetch;
global.fetch = fetchMock;

// Mock console.error
const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('TMDB API Security', () => {
  const apiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not log sensitive response body on error', async () => {
    const sensitiveData = 'SENSITIVE_API_KEY_LEAK';
    // @ts-expect-error - Mocking response partially
    vi.mocked(fetchMock).mockResolvedValue({
      ok: false,
      text: async () => `Error details containing ${sensitiveData}`,
      status: 401,
      statusText: 'Unauthorized'
    });

    try {
      await fetchFromTMDB('test', 1, 'movie', apiKey);
    } catch {
      // Expected error
    }

    expect(fetchMock).toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalled();

    const logArgs = consoleErrorMock.mock.calls[0].join(' ');

    // Assert sensitive data is NOT logged
    expect(logArgs).not.toContain(sensitiveData);

    // Assert safe status code/text IS logged
    expect(logArgs).toContain('401');
    expect(logArgs).toContain('Unauthorized');
  });
});
