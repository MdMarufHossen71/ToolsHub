/** Minimal shapes for untyped third-party modules (Wave 2+ lazy chunks). */
declare module "papaparse" {
  const Papa: {
    parse<T = Record<string, string>>(input: string, config?: Record<string, unknown>): {
      data: T[];
      errors: Array<{ message: string }>;
      meta: { fields?: string[] };
    };
    unparse(data: unknown, config?: Record<string, unknown>): string;
  };
  export default Papa;
}

declare module "iban" {
  const IBAN: { isValid(input: string): boolean };
  export default IBAN;
}

declare module "csso" {
  const csso: { minify(source: string): { css: string } };
  export default csso;
}

declare module "html-minifier-terser" {
  export function minify(source: string, options?: Record<string, unknown>): Promise<string>;
}

/**
 * Chromium's install prompt event. Not part of `lib.dom` yet, so the shape the
 * install banner relies on is declared here.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}
