export class VoiceRequestError extends Error {
  constructor(statusCode, errorCode, message, extras = {}) {
    super(message || errorCode);
    this.name = "VoiceRequestError";
    this.statusCode = statusCode;
    this.error = errorCode;
    Object.assign(this, extras);
  }
}

export function normalizeError(error, fallbackCode = 500, fallbackMessage = "internal-error") {
  const message = error?.message || fallbackMessage;
  const normalized = {
    statusCode: Number(error?.statusCode || fallbackCode),
    error: error?.error || fallbackMessage,
    message,
  };

  if (error?.maxChars !== undefined) {
    normalized.maxChars = error.maxChars;
  }
  if (error?.maxKm !== undefined) {
    normalized.maxKm = error.maxKm;
  }
  if (error?.maxBase64Chars !== undefined) {
    normalized.maxBase64Chars = error.maxBase64Chars;
  }
  if (error?.maxChunks !== undefined) {
    normalized.maxChunks = error.maxChunks;
  }
  if (error?.details !== undefined) {
    normalized.details = error.details;
  }

  return normalized;
}
