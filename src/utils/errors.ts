export class OpenProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'OpenProviderError';
  }
}

export class OpenProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenProviderConfigError';
  }
}
