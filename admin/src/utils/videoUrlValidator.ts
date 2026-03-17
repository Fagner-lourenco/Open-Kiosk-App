/**
 * ============================================
 * Video URL Validator
 * ============================================
 *
 * Validation states map directly to kiosk behavior:
 * - valid: cacheable on the kiosk and safe for offline playback
 * - remote_only: playable remotely, but not suitable for kiosk caching/offline
 * - invalid: should be fixed before relying on this asset
 */

import {
  describeAttractVideoMetrics,
  evaluateAttractVideoPolicy,
} from '../../shared/utils/attractVideoPolicy';
import { inspectVideoUrl } from '@/utils/videoMetadataInspector';

export type ValidationResult = {
  status: 'valid' | 'invalid' | 'remote_only';
  message: string;
  contentType?: string;
  contentLength?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  containerFormat?: 'mp4' | 'webm' | 'unknown';
  videoCodec?: string | null;
  codecProfile?: string | null;
  codecLevel?: string | null;
  cacheable: boolean;
};

const REMOTE_ONLY_DOMAINS = [
  'pexels.com',
  'pixabay.com',
  'coverr.co',
  'mixkit.co',
  'videvo.net',
  'vimeo.com',
  'player.vimeo.com',
  'cdn.videvo.net',
  'videos.pexels.com',
  'player.coverr.co',
];

const FIREBASE_STORAGE_DOMAINS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'firebasestorage.app',
  'appspot.com',
];

function isDomainMatch(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isRemoteOnlyDomain(hostname: string): boolean {
  return REMOTE_ONLY_DOMAINS.some((domain) => isDomainMatch(hostname, domain));
}

function isFirebaseStorageUrl(url: URL): boolean {
  return FIREBASE_STORAGE_DOMAINS.some((domain) => isDomainMatch(url.hostname, domain));
}

function buildSuccessMessage(
  contentLength: number | undefined,
  detail: string,
  mode: 'valid' | 'warning',
): string {
  const sizeMessage = contentLength
    ? ` Tamanho: ${(contentLength / (1024 * 1024)).toFixed(1)} MB.`
    : '';

  if (mode === 'warning') {
    return `Cacheavel no kiosk, mas no limite da politica. ${detail}${sizeMessage}`.trim();
  }

  return `Cacheavel no kiosk. ${detail}${sizeMessage}`.trim();
}

export async function validateVideoUrl(url: string): Promise<ValidationResult> {
  if (!url || !url.trim()) {
    return { status: 'invalid', message: 'URL vazia', cacheable: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'invalid', message: 'URL invalida', cacheable: false };
  }

  if (parsed.protocol !== 'https:') {
    return { status: 'invalid', message: 'URL deve usar HTTPS', cacheable: false };
  }

  if (isRemoteOnlyDomain(parsed.hostname)) {
    return {
      status: 'remote_only',
      message: `Playback remoto apenas. ${parsed.hostname} nao oferece um caminho confiavel para cache offline do kiosk.`,
      cacheable: false,
    };
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        status: 'invalid',
        message: `Servidor retornou ${response.status} ${response.statusText}`,
        cacheable: false,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || '0') || undefined;

    if (!contentType.startsWith('video/')) {
      return {
        status: 'invalid',
        message: `Content-Type "${contentType}" nao e video.`,
        contentType,
        contentLength,
        cacheable: false,
      };
    }

    let inspection;
    try {
      inspection = await inspectVideoUrl(url);
    } catch (error) {
      return {
        status: 'invalid',
        message: `Nao foi possivel ler metadados confiaveis do video. ${error instanceof Error ? error.message : 'Falha desconhecida.'}`,
        contentType,
        contentLength,
        cacheable: false,
      };
    }

    const policy = evaluateAttractVideoPolicy({
      width: inspection.width,
      height: inspection.height,
      durationSeconds: inspection.durationSeconds,
      contentLength,
      containerFormat: inspection.containerFormat,
      videoCodec: inspection.videoCodec,
      codecProfile: inspection.codecProfile,
      codecLevel: inspection.codecLevel,
    });

    if (policy.status === 'invalid') {
      return {
        status: 'invalid',
        message: `Video fora da politica do kiosk. ${policy.summary}`,
        contentType,
        contentLength,
        width: inspection.width,
        height: inspection.height,
        durationSeconds: inspection.durationSeconds,
        containerFormat: inspection.containerFormat,
        videoCodec: inspection.videoCodec,
        codecProfile: inspection.codecProfile,
        codecLevel: inspection.codecLevel,
        cacheable: false,
      };
    }

    const detail = policy.summary === 'Dentro da politica do kiosk.'
      ? describeAttractVideoMetrics(
        {
          width: inspection.width,
          height: inspection.height,
          durationSeconds: inspection.durationSeconds,
          contentLength,
        },
        policy.averageBitrateMbps,
      )
      : policy.summary;

    return {
      status: 'valid',
      message: buildSuccessMessage(contentLength, detail || 'Video compativel com o kiosk.', policy.status),
      contentType,
      contentLength,
      width: inspection.width,
      height: inspection.height,
      durationSeconds: inspection.durationSeconds,
      containerFormat: inspection.containerFormat,
      videoCodec: inspection.videoCodec,
      codecProfile: inspection.codecProfile,
      codecLevel: inspection.codecLevel,
      cacheable: true,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      if (isFirebaseStorageUrl(parsed)) {
        return {
          status: 'invalid',
          message: 'Firebase Storage bloqueou a validacao por CORS. O bucket precisa liberar https://localhost para o kiosk.',
          cacheable: false,
        };
      }

      return {
        status: 'remote_only',
        message: 'CORS bloqueado no navegador. O video pode tocar remotamente, mas nao e seguro depender de cache offline no kiosk.',
        cacheable: false,
      };
    }

    return {
      status: 'invalid',
      message: `Erro ao verificar URL: ${error instanceof Error ? error.message : 'Desconhecido'}`,
      cacheable: false,
    };
  }
}

export function getVideoValidationLabel(status: ValidationResult['status'] | 'cors_warning'): string {
  switch (status) {
    case 'valid':
      return 'Cacheavel no kiosk';
    case 'remote_only':
    case 'cors_warning':
      return 'Playback remoto apenas';
    default:
      return 'Invalido';
  }
}
