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
