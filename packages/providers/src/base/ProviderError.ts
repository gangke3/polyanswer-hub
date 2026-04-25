export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code = "PROVIDER_ERROR"
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

