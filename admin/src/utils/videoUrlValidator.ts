/**
 * ============================================================================
 * Video URL Validator
 * ============================================================================
 *
 * Validates video URLs for the attract screen configuration.
 * Performs HEAD request to check MIME type, CORS, and content length.
 *
 * Rules:
 * - Must be HTTPS
 * - HEAD request with redirect follow
 * - Content-Type must start with `video/`
 * - Warning if > 100MB, block if > 500MB
 * - CORS failure = warning (not blocker, WebView may bypass)
 */

export type ValidationResult = {
  status: 'valid' | 'invalid' | 'cors_warning';
  message: string;
  contentType?: string;
  contentLength?: number;
};

const MAX_SIZE_WARNING = 100 * 1024 * 1024;  // 100MB
const MAX_SIZE_BLOCK = 500 * 1024 * 1024;    // 500MB

/**
 * Validates a video URL by performing a HEAD request.
 *
 * @param url - The URL to validate
 * @returns Validation result with status and details
 */
export async function validateVideoUrl(url: string): Promise<ValidationResult> {
  // Basic URL checks
  if (!url || !url.trim()) {
    return { status: 'invalid', message: 'URL vazia' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'invalid', message: 'URL inválida' };
  }

  if (parsed.protocol !== 'https:') {
    return { status: 'invalid', message: 'URL deve usar HTTPS' };
  }

  // HEAD request
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        status: 'invalid',
        message: `Servidor retornou ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    // Check MIME type
    if (!contentType.startsWith('video/')) {
      return {
        status: 'invalid',
        message: `Content-Type "${contentType}" não é vídeo. Esperado: video/mp4, video/webm, etc.`,
        contentType,
        contentLength: contentLength || undefined,
      };
    }

    // Check size
    if (contentLength > MAX_SIZE_BLOCK) {
      return {
        status: 'invalid',
        message: `Arquivo muito grande (${formatBytes(contentLength)}). Máximo: 500MB`,
        contentType,
        contentLength,
      };
    }

    const sizeWarning = contentLength > MAX_SIZE_WARNING
      ? ` (${formatBytes(contentLength)} - considere comprimir)`
      : contentLength > 0
        ? ` (${formatBytes(contentLength)})`
        : '';

    return {
      status: 'valid',
      message: `Válido: ${contentType}${sizeWarning}`,
      contentType,
      contentLength: contentLength || undefined,
    };
  } catch (error) {
    // CORS or network error
    if (error instanceof TypeError) {
      return {
        status: 'cors_warning',
        message: 'CORS bloqueado no navegador. O vídeo pode funcionar no Kiosk (WebView ignora CORS).',
      };
    }

    return {
      status: 'invalid',
      message: `Erro ao verificar URL: ${error instanceof Error ? error.message : 'Desconhecido'}`,
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
