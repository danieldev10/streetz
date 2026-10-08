export class JobError extends Error {
  constructor(
    readonly code: string,
    readonly permanent = false,
  ) {
    super(code);
  }
}
