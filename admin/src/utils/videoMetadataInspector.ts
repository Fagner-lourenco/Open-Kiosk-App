export interface VideoMetadataInspection {
  width: number;
  height: number;
  durationSeconds: number;
  containerFormat: 'mp4' | 'webm' | 'unknown';
  videoCodec: string | null;
  codecProfile: string | null;
  codecLevel: string | null;
}

const INSPECTION_TIMEOUT_MS = 8000;
const REMOTE_CODEC_PROBE_BYTES = 4 * 1024 * 1024;
const WEBM_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function detectContainerFormat(bytes: Uint8Array): VideoMetadataInspection['containerFormat'] {
  if (bytes.length >= 8 && readAscii(bytes, 4, 4) === 'ftyp') {
    return 'mp4';
  }

  if (WEBM_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return 'webm';
  }

  return 'unknown';
}

function findAsciiSequence(bytes: Uint8Array, token: string): number {
  for (let index = 0; index <= bytes.length - token.length; index += 1) {
    if (readAscii(bytes, index, token.length) === token) {
      return index;
    }
  }

  return -1;
}

function mapAvcProfile(profileByte: number): string {
  switch (profileByte) {
    case 66:
      return 'Baseline';
    case 77:
      return 'Main';
    case 88:
      return 'Extended';
    case 100:
      return 'High';
    default:
      return `Profile-${profileByte}`;
  }
}

function formatAvcLevel(levelByte: number): string {
  return (levelByte / 10).toFixed(1).replace(/\.0$/, '.0');
}

function probeCodecMetadata(bytes: Uint8Array): Pick<
  VideoMetadataInspection,
  'containerFormat' | 'videoCodec' | 'codecProfile' | 'codecLevel'
> {
  const containerFormat = detectContainerFormat(bytes);

  if (containerFormat === 'webm') {
    if (findAsciiSequence(bytes, 'VP90') !== -1 || findAsciiSequence(bytes, 'vp09') !== -1) {
      return {
        containerFormat,
        videoCodec: 'vp09',
        codecProfile: null,
        codecLevel: null,
      };
    }

    if (findAsciiSequence(bytes, 'AV01') !== -1 || findAsciiSequence(bytes, 'av01') !== -1) {
      return {
        containerFormat,
        videoCodec: 'av01',
        codecProfile: null,
        codecLevel: null,
      };
    }

    return {
      containerFormat,
      videoCodec: 'webm',
      codecProfile: null,
      codecLevel: null,
    };
  }

  if (containerFormat !== 'mp4') {
    return {
      containerFormat,
      videoCodec: null,
      codecProfile: null,
      codecLevel: null,
    };
  }

  const avcConfigIndex = findAsciiSequence(bytes, 'avcC');
  if (avcConfigIndex !== -1 && avcConfigIndex + 8 < bytes.length) {
    const profileByte = bytes[avcConfigIndex + 5];
    const levelByte = bytes[avcConfigIndex + 7];

    return {
      containerFormat,
      videoCodec: 'avc1',
      codecProfile: mapAvcProfile(profileByte),
      codecLevel: formatAvcLevel(levelByte),
    };
  }

  const codecCandidates = ['avc1', 'hvc1', 'hev1', 'av01', 'vp09'] as const;
  for (const codec of codecCandidates) {
    if (findAsciiSequence(bytes, codec) !== -1) {
      return {
        containerFormat,
        videoCodec: codec,
        codecProfile: null,
        codecLevel: null,
      };
    }
  }

  return {
    containerFormat,
    videoCodec: 'unknown',
    codecProfile: null,
    codecLevel: null,
  };
}

async function probeLocalFileCodec(file: File): Promise<Pick<
  VideoMetadataInspection,
  'containerFormat' | 'videoCodec' | 'codecProfile' | 'codecLevel'
>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return probeCodecMetadata(bytes);
}

async function probeRemoteVideoCodec(url: string): Promise<Pick<
  VideoMetadataInspection,
  'containerFormat' | 'videoCodec' | 'codecProfile' | 'codecLevel'
>> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Range: `bytes=0-${REMOTE_CODEC_PROBE_BYTES - 1}`,
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Falha ao ler cabeçalho binário do vídeo (${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return probeCodecMetadata(bytes);
}

function inspectVideoSource(
  src: string,
  codecProbe: () => Promise<Pick<
    VideoMetadataInspection,
    'containerFormat' | 'videoCodec' | 'codecProfile' | 'codecLevel'
  >>,
  revokeUrl?: string,
): Promise<VideoMetadataInspection> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.clearTimeout(timeoutId);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);

      if (revokeUrl) {
        URL.revokeObjectURL(revokeUrl);
      }
    };

    const finishWithError = (message: string) => {
      if (settled) {
        return;
      }

      cleanup();
      reject(new Error(message));
    };

    const handleLoadedMetadata = () => {
      if (settled) {
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = video.duration;

      codecProbe()
        .then((codecMetadata) => {
          cleanup();

          if (!width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            reject(new Error('Nao foi possivel ler metadados confiaveis do video.'));
            return;
          }

          resolve({
            width,
            height,
            durationSeconds,
            ...codecMetadata,
          });
        })
        .catch((error) => {
          finishWithError(error instanceof Error ? error.message : 'Falha ao analisar codec do video.');
        });
    };

    const handleError = () => {
      const mediaErrorCode = video.error?.code;
      finishWithError(
        mediaErrorCode
          ? `Falha ao carregar metadados do video (MediaError ${mediaErrorCode}).`
          : 'Falha ao carregar metadados do video.',
      );
    };

    const timeoutId = window.setTimeout(() => {
      finishWithError('Tempo esgotado ao analisar metadados do video.');
    }, INSPECTION_TIMEOUT_MS);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.src = src;
    video.load();
  });
}

export function inspectVideoUrl(url: string): Promise<VideoMetadataInspection> {
  return inspectVideoSource(url, () => probeRemoteVideoCodec(url));
}

export function inspectVideoFile(file: File): Promise<VideoMetadataInspection> {
  const objectUrl = URL.createObjectURL(file);
  return inspectVideoSource(objectUrl, () => probeLocalFileCodec(file), objectUrl);
}
