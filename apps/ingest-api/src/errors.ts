export class PayloadConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PayloadConflictError";
  }
}

export class PayloadChecksumError extends Error {
  public constructor() {
    super("Payload data does not match the declared checksum");
    this.name = "PayloadChecksumError";
  }
}

export class UploadRateLimitError extends Error {
  public constructor() {
    super(
      "This account has reached its hourly upload allowance. Saved scans remain queued; retry later.",
    );
    this.name = "UploadRateLimitError";
  }
}

export class UploadStorageUnavailableError extends Error {
  public constructor() {
    super("Upload storage is temporarily unavailable. Keep the saved scan and retry later.");
    this.name = "UploadStorageUnavailableError";
  }
}
