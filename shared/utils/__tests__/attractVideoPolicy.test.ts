import { describe, expect, it } from 'vitest';
import { evaluateAttractVideoPolicy } from '../attractVideoPolicy';

describe('attractVideoPolicy', () => {
  it('rejeita video 4K com bitrate alto para o kiosk', () => {
    const result = evaluateAttractVideoPolicy({
      width: 4096,
      height: 2160,
      durationSeconds: 12.2,
      contentLength: 33_483_637,
      containerFormat: 'mp4',
      videoCodec: 'avc1',
      codecProfile: 'High',
      codecLevel: '5.2',
    });

    expect(result.status).toBe('invalid');
    expect(result.summary).toContain('4096x2160');
    expect(result.summary).toContain('Bitrate medio');
  });

  it('aceita video 1080p dentro da politica', () => {
    const result = evaluateAttractVideoPolicy({
      width: 1080,
      height: 1920,
      durationSeconds: 15,
      contentLength: 9_000_000,
      containerFormat: 'mp4',
      videoCodec: 'avc1',
      codecProfile: 'Main',
      codecLevel: '4.1',
    });

    expect(result.status).toBe('valid');
  });

  it('rejeita container ou codec nao suportado', () => {
    const result = evaluateAttractVideoPolicy({
      width: 1080,
      height: 1920,
      durationSeconds: 15,
      contentLength: 9_000_000,
      containerFormat: 'webm',
      videoCodec: 'vp09',
    });

    expect(result.status).toBe('invalid');
    expect(result.summary).toContain('Container WEBM');
    expect(result.summary).toContain('Codec vp09');
  });
});
