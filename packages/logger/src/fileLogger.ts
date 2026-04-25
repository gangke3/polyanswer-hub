import { redactSensitive } from "./redact.js";

export class FileLogger {
  info(message: string): void {
    console.log(redactSensitive(message));
  }

  error(message: string): void {
    console.error(redactSensitive(message));
  }
}
