const HONORIFICS = new Set(
  [
    'mr',
    'mrs',
    'ms',
    'miss',
    'mx',
    'dr',
    'prof',
    'sir',
    'madam',
    'rev',
    'fr',
    'hon',
    'judge',
  ].map((s) => s.toLowerCase())
);

function stripHonorificPrefix(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]?.toLowerCase().replace(/\.+$/, '');
    if (t && HONORIFICS.has(t)) {
      i += 1;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

export function bestEffortSplitFullName(raw: string): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} | null {
  const cleaned = String(raw)
    .trim()
    .replace(/\s+/g, ' ');

  if (!cleaned) return null;

  const tokens = stripHonorificPrefix(cleaned.split(' ').filter(Boolean));
  if (tokens.length < 2) return null;

  const firstName = tokens[0] ?? '';
  const lastName = tokens[tokens.length - 1] ?? '';
  const middle = tokens.slice(1, -1).join(' ').trim();

  if (!firstName || !lastName) return null;

  return {
    firstName,
    middleName: middle ? middle : null,
    lastName,
  };
}

