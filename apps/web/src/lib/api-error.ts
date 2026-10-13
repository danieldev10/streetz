export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export class SessionChangedError extends ApiError {
  constructor() {
    super("Your session changed. Please try again.", 409);
    this.name = "SessionChangedError";
  }
}
