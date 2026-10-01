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
   * Shape of the string sent to the backend:
   * - `datetime` (default): full ISO 8601 timestamp in UTC, e.g. `2026-10-01T13:45:00.000Z`.
   * - `date`: calendar date only, e.g. `2026-10-01` (UTC), for `LocalDate`-style fields.
   */
  readonly format?: 'datetime' | 'date';
}

/**
 * Converts ISO 8601 strings from the backend into `Date` objects and back.
 *
 * @usageNotes
 * ```ts
 * birthDate: { from: 'birth_date', transform: isoDate({ format: 'date' }) },
 * ```
 *
 * @publicApi
 */
export function isoDate(options: IsoDateOptions = {}): Transformer<string, Date> {
  const dateOnly = options.format === 'date';
  return {
    toFront: (value) => {
      expectType(value, 'string');
      return validDate(new Date(value), value);
    },
    toBack: (value) => {
      const iso = validDate(value, value).toISOString();
      return dateOnly ? iso.slice(0, 10) : iso;
    },
  };
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

/**
 * Converts numeric strings (e.g. decimals serialized as strings to keep precision) into
 * numbers and back.
 *
 * @publicApi
 */
export function numberString(): Transformer<string, number> {
  return {
    toFront: (value) => {
      expectType(value, 'string');
      const parsed = value.trim() === '' ? Number.NaN : Number(value);
      if (Number.isNaN(parsed)) throw new TypeError(`"${value}" is not a number.`);
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
