export const sanitizeFirestoreData = <T>(input: T): T => {
  if (input === undefined) return undefined as T;
  if (input === null) return null as T;
  if (input instanceof Date) return input;

  if (Array.isArray(input)) {
    const sanitizedArray = input
      .map((item) => sanitizeFirestoreData(item))
      .filter((item) => item !== undefined);
    return sanitizedArray as unknown as T;
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    // Preserva objetos Timestamp do Firestore (possuem toDate)
    if (typeof (obj as { toDate?: unknown }).toDate === 'function') {
      return input;
    }

    const result: Record<string, unknown> = {};
    Object.entries(obj).forEach(([key, value]) => {
      const sanitizedValue = sanitizeFirestoreData(value);
      if (sanitizedValue !== undefined) {
        result[key] = sanitizedValue;
      }
    });
    return result as T;
  }

  return input;
};
