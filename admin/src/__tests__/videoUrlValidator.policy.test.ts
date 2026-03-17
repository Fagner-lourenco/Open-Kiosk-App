import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/videoMetadataInspector', () => ({
  inspectVideoUrl: vi.fn(),
}));

import { inspectVideoUrl } from '@/utils/videoMetadataInspector';
import { validateVideoUrl } from '@/utils/videoUrlValidator';

const mockedInspectVideoUrl = vi.mocked(inspectVideoUrl);

function createHeadResponse(contentType: string, contentLength: number) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get(name: string) {
        if (name === 'content-type') {
          return contentType;
        }

        if (name === 'content-length') {
          return String(contentLength);
        }

        return null;
      },
    },
  };
}

describe('videoUrlValidator policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marca como invalido video 4K fora da politica', async () => {
    vi.mocked(fetch).mockResolvedValue(createHeadResponse('video/mp4', 33_483_637) as Response);
    mockedInspectVideoUrl.mockResolvedValue({
      width: 4096,
      height: 2160,
      durationSeconds: 12.2,
      containerFormat: 'mp4',
      videoCodec: 'avc1',
      codecProfile: 'High',
      codecLevel: '5.2',
    });

    const result = await validateVideoUrl('https://cdn.example.com/attract.mp4');

    expect(result.status).toBe('invalid');
    expect(result.message).toContain('politica do kiosk');
    expect(result.message).toContain('4096x2160');
  });

  it('aceita video compativel com o kiosk', async () => {
    vi.mocked(fetch).mockResolvedValue(createHeadResponse('video/mp4', 8_000_000) as Response);
    mockedInspectVideoUrl.mockResolvedValue({
      width: 1080,
      height: 1920,
      durationSeconds: 15,
      containerFormat: 'mp4',
      videoCodec: 'avc1',
      codecProfile: 'Main',
      codecLevel: '4.1',
    });

    const result = await validateVideoUrl('https://cdn.example.com/portrait.mp4');

    expect(result.status).toBe('valid');
    expect(result.message).toContain('Cacheavel no kiosk');
  });

  it('rejeita codec nao suportado mesmo com dimensoes validas', async () => {
    vi.mocked(fetch).mockResolvedValue(createHeadResponse('video/mp4', 8_000_000) as Response);
    mockedInspectVideoUrl.mockResolvedValue({
      width: 1080,
      height: 1920,
      durationSeconds: 15,
      containerFormat: 'mp4',
      videoCodec: 'hvc1',
      codecProfile: null,
      codecLevel: null,
    });

    const result = await validateVideoUrl('https://cdn.example.com/hevc.mp4');

    expect(result.status).toBe('invalid');
    expect(result.message).toContain('Codec hvc1');
  });
});
