/**
 * Helpers de tratamento de erro tipado.
 *
 * Substitui o padrão `catch (err: any)` por type guards seguros,
 * cobrindo FirebaseError (Auth/Firestore/Functions), Error nativo
 * e valores arbitrários lançados.
 */

/** Formato comum dos erros do Firebase (Auth, Firestore, Functions). */
export interface FirebaseLikeError {
  code: string;
  message: string;
}

/** Type guard para erros no formato Firebase ({ code, message }). */
export function isFirebaseError(err: unknown): err is FirebaseLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as Record<string, unknown>).code === 'string' &&
    typeof (err as Record<string, unknown>).message === 'string'
  );
}

/** Extrai o código do erro (ex.: 'auth/invalid-email'), se houver. */
export function getErrorCode(err: unknown): string | undefined {
  return isFirebaseError(err) ? err.code : undefined;
}

/** Extrai mensagem legível de qualquer erro, com fallback. */
export function getErrorMessage(err: unknown, fallback = 'Erro inesperado'): string {
  if (err instanceof Error && err.message) return err.message;
  if (isFirebaseError(err)) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/**
 * Resolve mensagem amigável a partir de um mapa código→mensagem,
 * caindo para o fallback quando o código não está mapeado.
 */
export function mapErrorByCode(
  err: unknown,
  messages: Record<string, string>,
  fallback: string
): string {
  const code = getErrorCode(err);
  return (code && messages[code]) || fallback;
}
