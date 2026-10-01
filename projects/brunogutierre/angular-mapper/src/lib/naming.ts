import { IDENTITY_CONVENTION } from './config';
import { MapperError } from './errors';
import type { NamingConvention, NamingConventionName } from './types';

/** Upper bound of memoized keys per function; real payloads reuse a small set of keys. */
const CACHE_LIMIT = 2_000;

/** Inserts `separator` at camelCase word boundaries and lower-cases: `userID` → `user_id`. */
function splitCamel(key: string, separator: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, `$1${separator}$2`)
    .replace(/([A-Z]+)([A-Z][a-z])/g, `$1${separator}$2`)
    .toLowerCase();
}

/** Removes `separator` runs between words and capitalizes the next one: `user_id` → `userId`. */
function joinCamel(key: string, separator: string): string {
  const boundary = new RegExp(`(?<=[^${separator}])${separator}+([a-z\\d])`, 'gi');
  return key.replace(boundary, (_, letter: string) => letter.toUpperCase());
}

/** Lower-cases a leading capital or acronym: `UserId` → `userId`, `HTTPStatus` → `httpStatus`. */
function uncapitalize(key: string): string {
  return key.replace(/^[A-Z]+(?=[A-Z][a-z]|\d|$)|^[A-Z]/, (head) => head.toLowerCase());
}

function capitalize(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function memoize(fn: (key: string) => string): (key: string) => string {
  const cache = new Map<string, string>();
  return (key) => {
    let result = cache.get(key);
    if (result === undefined) {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      result = fn(key);
      cache.set(key, result);
    }
    return result;
  };
}

function separated(separator: string): NamingConvention {
  return Object.freeze({
    toFront: memoize((key) => joinCamel(key, separator)),
    toBack: memoize((key) => splitCamel(key, separator)),
  });
}

const BUILT_IN_CONVENTIONS: Readonly<Record<NamingConventionName, NamingConvention>> = {
  camelCase: IDENTITY_CONVENTION,
  snake_case: separated('_'),
  'kebab-case': separated('-'),
  PascalCase: Object.freeze({ toFront: memoize(uncapitalize), toBack: memoize(capitalize) }),
};

/**
 * Returns the convention for a built-in name, or the given custom convention unchanged.
 *
 * @throws {MapperError} `MAPPER_INVALID_MAPPING` for an unknown name or a malformed object.
 */
export function resolveNamingConvention(
  convention: NamingConventionName | NamingConvention,
): NamingConvention {
  if (typeof convention === 'string') {
    if (Object.hasOwn(BUILT_IN_CONVENTIONS, convention)) return BUILT_IN_CONVENTIONS[convention];
    throw new MapperError(
      'MAPPER_INVALID_MAPPING',
      `Unknown naming convention "${convention}". ` +
        `Use one of ${Object.keys(BUILT_IN_CONVENTIONS).join(', ')} or a custom { toFront, toBack } object.`,
    );
  }
  const candidate = convention as Partial<NamingConvention> | null;
  if (typeof candidate?.toFront !== 'function' || typeof candidate.toBack !== 'function') {
    throw new MapperError(
      'MAPPER_INVALID_MAPPING',
      'A custom naming convention must define toFront(key) and toBack(key).',
    );
  }
  return convention;
}
