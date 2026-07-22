import { LoggerService } from "@nestjs/common";

type LogLevel = "log" | "error" | "warn" | "debug" | "verbose" | "fatal";

export class StructuredLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) {
    this.write("log", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write("verbose", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.write("fatal", message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]) {
    const context = typeof optionalParams.at(-1) === "string" ? optionalParams.at(-1) : undefined;
    const stack = level === "error" && typeof optionalParams[0] === "string" ? optionalParams[0] : undefined;
    const detail = message && typeof message === "object" && !(message instanceof Error) ? message : { message: this.toText(message) };
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: "crushclub-api",
      ...(context ? { context } : {}),
      ...detail,
      ...(stack ? { stack } : {})
    };
    const output = JSON.stringify(entry);

    if (level === "error" || level === "fatal") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  }

  private toText(value: unknown) {
    if (value instanceof Error) return value.message;
    if (typeof value === "string") return value;

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
