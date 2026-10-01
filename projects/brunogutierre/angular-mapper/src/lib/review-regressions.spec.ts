/**
 * Regression tests for issues found in the pre-release review: timezones, per-mapping
 * conventions, ignored fields, inherited members and strict parsing.
 */
import { DEFAULT_MAPPER_CONFIG } from './config';
import { defineMapping, ignore } from './define-mapping';
import { mapList, mapObject } from './engine';
import { isoDate, numberString } from './transformers';
import type { MappingContext } from './types';

const context: MappingContext = {
  mapping: 'test',
  path: 'field',
  direction: 'toFront',
  config: DEFAULT_MAPPER_CONFIG,
};

describe('isoDate({ format: "date" }) across timezones', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['America/Sao_Paulo', 180],
    ['Europe/Berlin', -60],
    ['Pacific/Kiritimati', -840],
    ['Pacific/Pago_Pago', 660],
  ])('keeps the calendar day in %s', (timezone, offset) => {
    vi.stubEnv('TZ', timezone);
    // Guard: the timezone really changed, so the test cannot pass by accident.
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(offset);
    const transformer = isoDate({ format: 'date' });
    const date = transformer.toFront('2026-10-01', context);

    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 9, 1, 0,
    ]);
    expect(transformer.toBack(date, context)).toBe('2026-10-01');
    expect(transformer.toBack(new Date(2026, 9, 1, 23, 59), context)).toBe('2026-10-01');
  });

  it('keeps years below 100 literal', () => {
    const transformer = isoDate({ format: 'date' });
    expect(transformer.toBack(transformer.toFront('0042-03-04', context), context)).toBe(
      '0042-03-04',
    );
  });

  it.each(['2026-02-30', '2026-13-01', '2026-10-01T00:00:00Z', 'Oct 1'])('rejects %s', (value) => {
    expect(() => isoDate({ format: 'date' }).toFront(value, context)).toThrow(TypeError);
  });
});

describe('isoDate() strict parsing', () => {
  it.each([
    '2026-10-01',
    '2026-10-01T10:30',
    '2026-10-01T10:30:00.123456Z',
    '2026-10-01T10:30:00+0300',
  ])('accepts %s', (value) => {
    expect(isoDate().toFront(value, context)).toBeInstanceOf(Date);
  });

  it.each(['1', 'Oct 1', '10/01/2026', '2026-10-01T'])('rejects non-ISO %s', (value) => {
    expect(() => isoDate().toFront(value, context)).toThrow('is not an ISO 8601 date');
  });
});

describe('numberString() symmetry', () => {
  it.each(['Infinity', '-Infinity', 'NaN', '0x10', '1e400', '1,5'])('rejects %s', (value) => {
    expect(() => numberString().toFront(value, context)).toThrow(TypeError);
  });

  it.each([
    ['.5', 0.5],
    ['+3', 3],
    ['1E3', 1000],
    ['10.', 10],
  ])('accepts %s', (value, expected) => {
    expect(numberString().toFront(value, context)).toBe(expected);
  });
});

describe('per-mapping options', () => {
  it('a convention alone implies converting undeclared fields', () => {
    const mapping = defineMapping<object, object>('m', {}, { convention: 'snake_case' });

    expect(mapObject(mapping, { user_id: 1 }, 'toFront', DEFAULT_MAPPER_CONFIG)).toEqual({
      userId: 1,
    });
  });

  it('a convention does not relax global strict mode', () => {
    const mapping = defineMapping<object, object>('m', {}, { convention: 'snake_case' });
    const strict = { ...DEFAULT_MAPPER_CONFIG, undeclared: 'error' as const };

    expect(() => mapObject(mapping, { user_id: 1 }, 'toFront', strict)).toThrow(
      expect.objectContaining({ code: 'MAPPER_UNKNOWN_FIELD' }),
    );
  });

  it('an explicit policy wins over the implied one', () => {
    const mapping = defineMapping<object, object>(
      'm',
      {},
      { convention: 'snake_case', undeclared: 'keep' },
    );

    expect(mapObject(mapping, { user_id: 1 }, 'toFront', DEFAULT_MAPPER_CONFIG)).toEqual({
      user_id: 1,
    });
  });
});

interface Dto {
  name: string;
  selected?: number;
}
interface Model {
  name: string;
  selected: boolean;
  ctor: unknown;
}

describe('ignored fields', () => {
  it('are never filled from undeclared backend fields', () => {
    const mapping = defineMapping<Dto, Model>('m', { selected: ignore() });

    expect(
      mapObject(mapping, { name: 'a', selected: 1 }, 'toFront', DEFAULT_MAPPER_CONFIG),
    ).toEqual({ name: 'a' });
  });
});

describe('inherited members', () => {
  it('are not read for declared fields missing from the input', () => {
    const spec: Record<string, unknown> = { ctor: { from: 'constructor', only: 'toFront' } };
    const mapping = defineMapping<Dto, Model>('m', spec);

    expect(mapObject(mapping, { name: 'a' }, 'toFront', DEFAULT_MAPPER_CONFIG)).toEqual({
      name: 'a',
    });
  });
});

describe('input description', () => {
  it('handles null-prototype objects in error messages', () => {
    const mapping = defineMapping<Dto, Model>('m', {});

    expect(() => mapList(mapping, Object.create(null), 'toFront', DEFAULT_MAPPER_CONFIG)).toThrow(
      'Expected an array, got an instance of Object.',
    );
  });
});

describe('field spec validation', () => {
  it('rejects an empty backend key', () => {
    const spec: Record<string, unknown> = { name: '' };
    expect(() => defineMapping<Dto, Model>('m', spec)).toThrow(
      expect.objectContaining({ code: 'MAPPER_INVALID_MAPPING', path: 'name' }),
    );
  });
});
