import { applyTransformer, mapObject } from './engine';
import { MapperError } from './errors';
import type { Mapping, MappingContext, Transformer } from './types';

/**
 * Options of {@link isoDate}.
 *
 * @publicApi
 */
export interface IsoDateOptions {
  /**
   * - `datetime` (default): an instant. Reads any ISO 8601 date-time and sends the full UTC
   *   timestamp, e.g. `2026-10-01T13:45:00.000Z`.
   * - `date`: a calendar date such as `2026-10-01`, for `LocalDate`-style fields. It is read as
   *   local midnight and sent from local date parts, so the day never shifts with the user's
   *   timezone.
   */
  readonly format?: 'datetime' | 'date';
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

/**
 * Converts ISO 8601 strings from the backend into `Date` objects and back. Strings that are not
 * ISO 8601 (e.g. `"Oct 1"`) are rejected instead of being guessed.
 *
 * @usageNotes
 * ```ts
 * createdAt: { from: 'created_at', transform: isoDate() },
 * birthDate: { from: 'birth_date', transform: isoDate({ format: 'date' }) },
 * ```
 *
 * @publicApi
 */
export function isoDate(options: IsoDateOptions = {}): Transformer<string, Date> {
  if (options.format === 'date') {
    return {
      toFront: (value) => parseLocalDate(value),
      toBack: (value) => {
        const date = validDate(value, value);
        return [
          String(date.getFullYear()).padStart(4, '0'),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');
      },
    };
  }
  return {
    toFront: (value) => {
      expectType(value, 'string');
      if (!ISO_DATE_TIME.test(value)) throw new TypeError(`"${value}" is not an ISO 8601 date.`);
      return validDate(new Date(value), value);
    },
    toBack: (value) => validDate(value, value).toISOString(),
  };
}

function parseLocalDate(value: unknown): Date {
  expectType(value, 'string');
  const match = ISO_DATE.exec(value as string);
  if (!match)
    throw new TypeError(`"${String(value)}" is not an ISO 8601 calendar date (YYYY-MM-DD).`);
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(0);
  date.setFullYear(year, month - 1, day); // setFullYear keeps years 0-99 literal
  date.setHours(0, 0, 0, 0);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new TypeError(`"${String(value)}" is not a valid calendar date.`);
  }
  return date;
}

/**
 * Converts Unix timestamps in milliseconds into `Date` objects and back.
 *
 * @publicApi
 */
export function epochMillis(): Transformer<number, Date> {
  return {
    toFront: (value) => {
      expectType(value, 'number');
      return validDate(new Date(value), value);
    },
    toBack: (value) => validDate(value, value).getTime(),
  };
}

/**
 * Converts Unix timestamps in seconds into `Date` objects and back. Milliseconds are truncated
 * when sending.
 *
 * @publicApi
 */
export function epochSeconds(): Transformer<number, Date> {
  return {
    toFront: (value) => {
      expectType(value, 'number');
      return validDate(new Date(value * 1000), value);
    },
    toBack: (value) => Math.floor(validDate(value, value).getTime() / 1000),
  };
}

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Converts decimal strings (e.g. decimals serialized as strings to keep precision) into
 * numbers and back. Hexadecimal, `Infinity` and `NaN` are rejected in both directions.
 *
 * @publicApi
 */
export function numberString(): Transformer<string, number> {
  return {
    toFront: (value) => {
      expectType(value, 'string');
      const parsed = DECIMAL.test(value.trim()) ? Number(value) : Number.NaN;
      if (!Number.isFinite(parsed)) throw new TypeError(`"${value}" is not a decimal number.`);
      return parsed;
    },
    toBack: (value) => {
      expectType(value, 'number');
      if (!Number.isFinite(value))
        throw new TypeError(`${String(value)} cannot be sent as a number string.`);
      return String(value);
    },
  };
}

/**
 * Translates between a closed set of backend codes and frontend values.
 *
 * Pass an object when backend codes are strings, or an array of `[backend, frontend]` pairs
 * when they are numbers. Values must be unique in both directions; unknown values throw.
 *
 * @usageNotes
 * ```ts
 * status: { from: 'status', transform: enumMap({ A: 'active', I: 'inactive' }) },
 * priority: { from: 'priority_code', transform: enumMap([[1, 'low'], [2, 'high']]) },
 * ```
 *
 * @publicApi
 */
export function enumMap<const T extends Record<string, unknown>>(
  table: T,
): Transformer<keyof T & string, T[keyof T]>;
export function enumMap<const P extends readonly (readonly [string | number, unknown])[]>(
  pairs: P,
): Transformer<P[number][0], P[number][1]>;
export function enumMap(
  table: Record<string, unknown> | readonly (readonly [string | number, unknown])[],
): Transformer<unknown, unknown> {
  const pairs: readonly (readonly [unknown, unknown])[] = Array.isArray(table)
    ? table
    : Object.entries(table);
  const toFront = new Map<unknown, unknown>();
  const toBack = new Map<unknown, unknown>();

  for (const [back, front] of pairs) {
    if (toFront.has(back) || toBack.has(front)) {
      throw new MapperError(
        'MAPPER_INVALID_MAPPING',
        `enumMap() needs unique values in both directions; ${describe(back)} → ${describe(front)} is a duplicate.`,
      );
    }
    toFront.set(back, front);
    toBack.set(front, back);
  }

  return {
    toFront: (value) => lookup(toFront, value, 'backend'),
    toBack: (value) => lookup(toBack, value, 'frontend'),
  };
}

/**
 * Builds a transformer from two functions. Useful for one-off conversions; prefer naming and
 * exporting reusable ones.
 *
 * @usageNotes
 * ```ts
 * const cents = custom<number, number>({ toFront: (c) => c / 100, toBack: (v) => Math.round(v * 100) });
 * ```
 *
 * @publicApi
 */
export function custom<B, F>(transformer: Transformer<B, F>): Transformer<B, F> {
  return transformer;
}

/**
 * Applies another mapping to a nested object, using the same direction, configuration and
 * error paths as the parent.
 *
 * @usageNotes
 * ```ts
 * address: { from: 'home_address', transform: nested(addressMapping) },
 * ```
 *
 * @publicApi
 */
export function nested<B, F>(mapping: Mapping<B, F>): Transformer<B, F> {
  const run = (value: unknown, context: MappingContext): unknown =>
    mapObject(mapping, value, context.direction, context.config, context.path);
  return {
    toFront: (value, context) => run(value, context) as F,
    toBack: (value, context) => run(value, context) as B,
  };
}

/**
 * Applies a transformer to every element of an array. `null` elements are kept as `null`.
 *
 * @usageNotes
 * ```ts
 * addresses: { from: 'addresses', transform: listOf(nested(addressMapping)) },
 * tags: { from: 'tag_codes', transform: listOf(enumMap({ N: 'new', S: 'sale' })) },
 * ```
 *
 * @publicApi
 */
export function listOf<B, F>(item: Transformer<B, F>): Transformer<B[], F[]> {
  const run = (value: unknown, context: MappingContext): unknown[] => {
    if (!Array.isArray(value)) throw new TypeError(`Expected an array, got ${describe(value)}.`);
    return value.map((element: unknown, index) =>
      element === null
        ? null
        : applyTransformer(item, element, {
            ...context,
            path: `${context.path}[${String(index)}]`,
          }),
    );
  };
  return {
    toFront: (value, context) => run(value, context) as F[],
    toBack: (value, context) => run(value, context) as B[],
  };
}

function lookup(table: ReadonlyMap<unknown, unknown>, value: unknown, side: string): unknown {
  if (!table.has(value)) throw new TypeError(`Unknown ${side} value ${describe(value)}.`);
  return table.get(value);
}

function expectType(value: unknown, type: 'string' | 'number'): void {
  if (typeof value !== type) throw new TypeError(`Expected a ${type}, got ${describe(value)}.`);
}

function validDate(date: unknown, original: unknown): Date {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`${describe(original)} is not a valid date.`);
  }
  return date;
}

function describe(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) return 'an array';
  if (value instanceof Date) return 'a Date';
  if (typeof value === 'object' && value !== null) return 'an object';
  return String(value);
}
