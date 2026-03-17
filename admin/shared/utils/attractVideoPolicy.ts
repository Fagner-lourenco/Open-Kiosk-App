export interface AttractVideoPolicyMetrics {
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  contentLength?: number | null;
  containerFormat?: 'mp4' | 'webm' | 'unknown' | null;
  videoCodec?: string | null;
  codecProfile?: string | null;
  codecLevel?: string | null;
}

export interface AttractVideoPolicyEvaluation {
  status: 'valid' | 'warning' | 'invalid';
  summary: string;
  reasons: string[];
  averageBitrateMbps: number | null;
}

export const ATTRACT_VIDEO_POLICY = {
  recommendedFileSizeBytes: 25 * 1024 * 1024,
  hardMaxFileSizeBytes: 50 * 1024 * 1024,
  maxDimensionPx: 1920,
  maxPixels: 1920 * 1080,
  supportedContainerFormats: ['mp4'] as const,
  supportedVideoCodecs: ['avc1'] as const,
  supportedCodecProfiles: ['Baseline', 'Main', 'High'] as const,
  hardMaxCodecLevel: 4.2,
  recommendedAverageBitrateMbps: 6,
  hardMaxAverageBitrateMbps: 8,
  playbackStartTimeoutMs: 4000,
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationSeconds: number): string {
  return `${durationSeconds.toFixed(1)} s`;
}

function formatBitrate(mbps: number): string {
  return `${mbps.toFixed(1)} Mbps`;
}

function normalizePositiveNumber(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function normalizeText(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
}

function parseCodecLevel(value?: string | null): number | null {
  const normalizedLevel = normalizeText(value);
  if (!normalizedLevel) {
    return null;
  }

  const numericLevel = Number.parseFloat(normalizedLevel);
  return Number.isFinite(numericLevel) ? numericLevel : null;
}

export function describeAttractVideoMetrics(
  metrics: AttractVideoPolicyMetrics,
  averageBitrateMbps?: number | null,
): string {
  const parts: string[] = [];
  const width = normalizePositiveNumber(metrics.width);
  const height = normalizePositiveNumber(metrics.height);
  const durationSeconds = normalizePositiveNumber(metrics.durationSeconds);
  const contentLength = normalizePositiveNumber(metrics.contentLength);
  const safeAverageBitrate = normalizePositiveNumber(averageBitrateMbps);
  const containerFormat = normalizeText(metrics.containerFormat);
  const videoCodec = normalizeText(metrics.videoCodec);
  const codecProfile = normalizeText(metrics.codecProfile);
  const codecLevel = normalizeText(metrics.codecLevel);

  if (width && height) {
    parts.push(`${width}x${height}`);
  }

  if (durationSeconds) {
    parts.push(formatDuration(durationSeconds));
  }

  if (safeAverageBitrate) {
    parts.push(formatBitrate(safeAverageBitrate));
  }

  if (containerFormat) {
    parts.push(containerFormat.toUpperCase());
  }

  if (videoCodec) {
    const profileDetails = [codecProfile, codecLevel ? `Level ${codecLevel}` : null]
      .filter(Boolean)
      .join(' ');
    parts.push(profileDetails ? `${videoCodec} ${profileDetails}` : videoCodec);
  }

  if (contentLength) {
    parts.push(formatBytes(contentLength));
  }

  return parts.join(' | ');
}

export function evaluateAttractVideoPolicy(
  metrics: AttractVideoPolicyMetrics,
): AttractVideoPolicyEvaluation {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const width = normalizePositiveNumber(metrics.width);
  const height = normalizePositiveNumber(metrics.height);
  const durationSeconds = normalizePositiveNumber(metrics.durationSeconds);
  const contentLength = normalizePositiveNumber(metrics.contentLength);
  const containerFormat = normalizeText(metrics.containerFormat);
  const videoCodec = normalizeText(metrics.videoCodec);
  const codecProfile = normalizeText(metrics.codecProfile);
  const codecLevel = parseCodecLevel(metrics.codecLevel);

  if (width && height) {
    if (Math.max(width, height) > ATTRACT_VIDEO_POLICY.maxDimensionPx) {
      reasons.push(
        `Resolucao ${width}x${height} acima do limite do kiosk (${ATTRACT_VIDEO_POLICY.maxDimensionPx}px no maior lado).`,
      );
    }

    if ((width * height) > ATTRACT_VIDEO_POLICY.maxPixels) {
      reasons.push(
        `Resolucao ${width}x${height} acima do teto de pixels do kiosk (1080p).`,
      );
    }
  }

  if (contentLength && contentLength > ATTRACT_VIDEO_POLICY.hardMaxFileSizeBytes) {
    reasons.push(
      `Arquivo muito grande (${formatBytes(contentLength)}). Limite: ${formatBytes(ATTRACT_VIDEO_POLICY.hardMaxFileSizeBytes)}.`,
    );
  } else if (contentLength && contentLength > ATTRACT_VIDEO_POLICY.recommendedFileSizeBytes) {
    warnings.push(
      `Arquivo pesado (${formatBytes(contentLength)}). Considere comprimir para reduzir download e uso de armazenamento.`,
    );
  }

  if (containerFormat === 'unknown') {
    reasons.push('Nao foi possivel confirmar o container do video para o kiosk.');
  } else if (
    containerFormat &&
    !ATTRACT_VIDEO_POLICY.supportedContainerFormats.includes(
      containerFormat as (typeof ATTRACT_VIDEO_POLICY.supportedContainerFormats)[number],
    )
  ) {
    reasons.push(`Container ${containerFormat.toUpperCase()} nao e suportado no kiosk. Use MP4.`);
  }

  if (videoCodec === 'unknown') {
    reasons.push('Nao foi possivel confirmar o codec do video para o kiosk.');
  } else if (
    videoCodec &&
    !ATTRACT_VIDEO_POLICY.supportedVideoCodecs.includes(
      videoCodec as (typeof ATTRACT_VIDEO_POLICY.supportedVideoCodecs)[number],
    )
  ) {
    reasons.push(`Codec ${videoCodec} nao e suportado no kiosk. Use H.264/avc1.`);
  }

  if (
    codecProfile &&
    videoCodec === 'avc1' &&
    !ATTRACT_VIDEO_POLICY.supportedCodecProfiles.includes(
      codecProfile as (typeof ATTRACT_VIDEO_POLICY.supportedCodecProfiles)[number],
    )
  ) {
    reasons.push(`Perfil ${codecProfile} nao e suportado no kiosk.`);
  }

  if (codecLevel && codecLevel > ATTRACT_VIDEO_POLICY.hardMaxCodecLevel) {
    reasons.push(
      `Level ${codecLevel.toFixed(1)} acima do limite do kiosk (${ATTRACT_VIDEO_POLICY.hardMaxCodecLevel.toFixed(1)}).`,
    );
  }

  let averageBitrateMbps: number | null = null;
  if (contentLength && durationSeconds) {
    averageBitrateMbps = (contentLength * 8) / durationSeconds / 1_000_000;

    if (averageBitrateMbps > ATTRACT_VIDEO_POLICY.hardMaxAverageBitrateMbps) {
      reasons.push(
        `Bitrate medio ${formatBitrate(averageBitrateMbps)} acima do limite do kiosk (${formatBitrate(ATTRACT_VIDEO_POLICY.hardMaxAverageBitrateMbps)}).`,
      );
    } else if (averageBitrateMbps > ATTRACT_VIDEO_POLICY.recommendedAverageBitrateMbps) {
      warnings.push(
        `Bitrate medio ${formatBitrate(averageBitrateMbps)} no limite. Prefira ate ${formatBitrate(ATTRACT_VIDEO_POLICY.recommendedAverageBitrateMbps)}.`,
      );
    }
  }

  const detail = describeAttractVideoMetrics(metrics, averageBitrateMbps);

  if (reasons.length > 0) {
    return {
      status: 'invalid',
      summary: [reasons.join(' '), detail ? `Detalhes: ${detail}.` : ''].filter(Boolean).join(' '),
      reasons,
      averageBitrateMbps,
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      summary: [warnings.join(' '), detail ? `Detalhes: ${detail}.` : ''].filter(Boolean).join(' '),
      reasons: warnings,
      averageBitrateMbps,
    };
  }

  return {
    status: 'valid',
    summary: detail ? `Detalhes: ${detail}.` : 'Dentro da politica do kiosk.',
    reasons: [],
    averageBitrateMbps,
  };
}
