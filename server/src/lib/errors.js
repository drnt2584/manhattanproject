export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Error thrown by a channel provider. `transient` errors are retried. */
export class SendError extends Error {
  constructor(message, { transient = false, code, raw } = {}) {
    super(message);
    this.transient = transient;
    this.code = code;
    this.raw = raw;
  }
}
