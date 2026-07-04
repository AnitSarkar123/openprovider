declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exitCode?: number;
  uptime(): number;
};

declare const require: {
  main?: unknown;
};

declare const module: unknown;

declare const Buffer: {
  from(input: ArrayBuffer | Uint8Array | string, encoding?: string): Uint8Array & {
    toString(encoding?: string): string;
  };
};

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare module 'node:http' {
  export function createServer(
    listener: (request: any, response: any) => void
  ): {
    listen(port: number, host: string, callback?: () => void): void;
    close(callback?: () => void): void;
  };
}
