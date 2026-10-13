// Tiny HTML helpers shared by the source adapters (no HTML parser dependency).

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ndash: '–',
  mdash: '—',
};

export function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (whole, dec: string, hex: string, name: string) => {
      if (dec) return safeChar(Number(dec), whole);
      if (hex) return safeChar(parseInt(hex, 16), whole);
      return NAMED[name.toLowerCase()] ?? whole;
    },
  );
}

function safeChar(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Strips tags, decodes entities and collapses whitespace. List items / breaks become spaces. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ')
      .replace(/<\/(?:li|p|div|h[1-6]|tr)>|<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}
