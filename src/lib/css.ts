import type { CSSProperties } from 'react';

/** Preserve the reference's inline declarations without a template runtime. */
export function css(declarations: string): CSSProperties {
  return Object.fromEntries(
    declarations.split(';').filter(Boolean).map(declaration => {
      const colon = declaration.indexOf(':');
      const name = declaration.slice(0, colon).trim()
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return [name, declaration.slice(colon + 1).trim()];
    }),
  ) as CSSProperties;
}
