import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dictionary: Record<string, string> = {
        'attract.title': 'Escolha e pegue seu chopp',
        'attract.subtitle': 'Toque para servir',
        'attract.start': 'Pegar agora',
        'attract.keyboardHint': 'Tambem funciona com teclado',
        'attract.kioskStartScreen': 'Tela de atracao',
      };

      return dictionary[key] || key;
    },
  }),
}));

vi.mock('@/hooks/useAudioVoice', () => ({
  unlockAudio: vi.fn(),
}));

vi.mock('@/hooks/useCachedVideo', () => ({
  useCachedVideo: vi.fn(),
}));

import { useCachedVideo } from '@/hooks/useCachedVideo';
import AttractScreen from '@/components/AttractScreen';

const mockedUseCachedVideo = vi.mocked(useCachedVideo);

describe('AttractScreen video behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mockedUseCachedVideo.mockReturnValue({
      videoUrl: 'https://cdn.example.com/attract.mp4',
      isCached: true,
      isDownloading: false,
      downloadProgress: 100,
      error: null,
      cacheAvailable: true,
      source: 'native-file',
      triggerDownload: vi.fn(),
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('remove o video quando o asset excede a politica do kiosk', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <AttractScreen
        visible
        onStart={vi.fn()}
        attractVideoConfig={{
          isEnabled: true,
          videoUrl: 'https://cdn.example.com/attract.mp4',
          contentLength: 33_483_637,
        }}
      />,
    );

    const video = screen.getByTestId('attract-video');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 4096 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 2160 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12.2 });

    fireEvent(video, new Event('loadedmetadata'));

    await waitFor(() => {
      expect(screen.queryByTestId('attract-video')).toBeNull();
    });
  });

  it('so revela o video depois de entrar em playing', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock,
    });

    render(
      <AttractScreen
        visible
        onStart={vi.fn()}
        attractVideoConfig={{
          isEnabled: true,
          videoUrl: 'https://cdn.example.com/attract.mp4',
          contentLength: 8_000_000,
          videoOpacity: 0.6,
        }}
      />,
    );

    const video = screen.getByTestId('attract-video');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1080 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 15 });

    expect((video as HTMLVideoElement).style.opacity).toBe('0');

    fireEvent(video, new Event('loadedmetadata'));
    fireEvent(video, new Event('canplay'));
    fireEvent(video, new Event('playing'));

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
      expect((screen.getByTestId('attract-video') as HTMLVideoElement).style.opacity).toBe('0.6');
    });
  });

  it('cai para fundo estatico quando play() falha', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('decode failed')),
    });

    render(
      <AttractScreen
        visible
        onStart={vi.fn()}
        attractVideoConfig={{
          isEnabled: true,
          videoUrl: 'https://cdn.example.com/attract.mp4',
          contentLength: 8_000_000,
        }}
      />,
    );

    const video = screen.getByTestId('attract-video');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1080 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 15 });

    fireEvent(video, new Event('loadedmetadata'));
    fireEvent(video, new Event('canplay'));

    await waitFor(() => {
      expect(screen.queryByTestId('attract-video')).toBeNull();
    });
  });
});
