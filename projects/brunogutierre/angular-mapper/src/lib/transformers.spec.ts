import { DEFAULT_MAPPER_CONFIG } from './config';
import { defineMapping } from './define-mapping';
import { mapObject } from './engine';
import { MapperError } from './errors';
import {
  custom,
  enumMap,
  epochMillis,
  epochSeconds,
  isoDate,
  listOf,
  nested,
  numberString,
} from './transformers';
import type { MappingContext, Transformer } from './types';

const context: MappingContext = {
  mapping: 'test',
  path: 'field',
  direction: 'toFront',
  config: DEFAULT_MAPPER_CONFIG,
};

/** Calls a transformer with an arbitrary (possibly mistyped) runtime value. */
const toFront = <B, F>(transformer: Transformer<B, F>, value: unknown): F =>
  transformer.toFront(value as B, context);
const toBack = <B, F>(transformer: Transformer<B, F>, value: unknown): B =>
  transformer.toBack(value as F, { ...context, direction: 'toBack' });

describe('isoDate', () => {
  it('parses ISO timestamps and serializes them in UTC', () => {
    const date = toFront(isoDate(), '2026-10-01T10:30:00-03:00');

    expect(date).toEqual(new Date(Date.UTC(2026, 9, 1, 13, 30)));
    expect(toBack(isoDate(), date)).toBe('2026-10-01T13:30:00.000Z');
  });

  it('serializes calendar dates with format: date', () => {
    const date = toFront(isoDate({ format: 'date' }), '2026-02-28');

    expect(date).toEqual(new Date(2026, 1, 28));
    expect(toBack(isoDate({ format: 'date' }), date)).toBe('2026-02-28');
  });

  it.each([['not a date'], [''], [42]])('rejects %o', (value) => {
    expect(() => toFront(isoDate(), value)).toThrow(TypeError);
  });

  it('rejects invalid dates when sending', () => {
    expect(() => toBack(isoDate(), new Date(Number.NaN))).toThrow('a Date is not a valid date.');
    expect(() => toBack(isoDate(), '2026-01-01')).toThrow('"2026-01-01" is not a valid date.');
  });
});

describe('epochMillis / epochSeconds', () => {
  const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 999));

  it('converts milliseconds', () => {
    expect(toFront(epochMillis(), date.getTime())).toEqual(date);
    expect(toBack(epochMillis(), date)).toBe(date.getTime());
  });

  it('converts seconds, truncating milliseconds when sending', () => {
    expect(toFront(epochSeconds(), 1_767_225_600)).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(toBack(epochSeconds(), date)).toBe(1_767_225_600);
  });

  it('rejects non-numbers and out-of-range values', () => {
    expect(() => toFront(epochMillis(), '1')).toThrow('Expected a number, got "1".');
    expect(() => toFront(epochSeconds(), 1e300)).toThrow('is not a valid date');
  });
});

describe('numberString', () => {
  it('converts between numeric strings and numbers', () => {
    expect(toFront(numberString(), ' 12.50 ')).toBe(12.5);
    expect(toFront(numberString(), '-1e3')).toBe(-1000);
    expect(toBack(numberString(), 12.5)).toBe('12.5');
  });

  it.each([['abc'], ['  '], [12]])('rejects %o when reading', (value) => {
    expect(() => toFront(numberString(), value)).toThrow(TypeError);
  });

  it.each([[Number.NaN], [Infinity], ['12']])('rejects %o when sending', (value) => {
    expect(() => toBack(numberString(), value)).toThrow(TypeError);
  });
});

describe('enumMap', () => {
  it('translates string codes with an object table', () => {
    const status = enumMap({ A: 'active', I: 'inactive' });

    expect(toFront(status, 'A')).toBe('active');
    expect(toBack(status, 'inactive')).toBe('I');
  });

  it('translates numeric codes with a pair list', () => {
    const priority = enumMap([
      [1, 'low'],
      [2, 'high'],
    ]);

    expect(toFront(priority, 2)).toBe('high');
    expect(toBack(priority, 'low')).toBe(1);
  });

  it('can map codes to non-string values such as booleans', () => {
    const flag = enumMap({ Y: true, N: false });

    expect(toFront(flag, 'N')).toBe(false);
    expect(toBack(flag, true)).toBe('Y');
  });

  it('rejects unknown values in both directions', () => {
    const status = enumMap({ A: 'active' });

    expect(() => toFront(status, 'X')).toThrow('Unknown backend value "X".');
    expect(() => toBack(status, 'gone')).toThrow('Unknown frontend value "gone".');
  });

  it('rejects tables that are not one-to-one', () => {
    expect(() => enumMap({ A: 'active', B: 'active' })).toThrow(MapperError);
    expect(() =>
      enumMap([
        [1, 'a'],
        [1, 'b'],
      ]),
    ).toThrow('1 → "b" is a duplicate');
  });
});

describe('custom', () => {
  it('returns the given transformer', () => {
    const cents = {
      toFront: (value: number) => value / 100,
      toBack: (value: number) => Math.round(value * 100),
    };

    expect(custom(cents)).toBe(cents);
    expect(toBack(custom(cents), 12.34)).toBe(1234);
  });
});

interface AddressDto {
  zip_code: string;
  geo?: { lat_lng: string };
}
interface Address {
  zipCode: string;
}
interface PersonDto {
  home: AddressDto | null;
  others: (AddressDto | null)[];
  visits: string[];
}
interface Person {
  home: Address | null;
  others: (Address | null)[];
  visits: Date[];
}

const addressMapping = defineMapping<AddressDto, Address>(
  'address',
  { zipCode: 'zip_code' },
  { undeclared: 'error' },
);
const personMapping = defineMapping<PersonDto, Person>('person', {
  home: { from: 'home', transform: nested(addressMapping) },
  others: { from: 'others', transform: listOf(nested(addressMapping)) },
  visits: { from: 'visits', transform: listOf(isoDate({ format: 'date' })) },
});

describe('nested and listOf', () => {
  const dto: PersonDto = {
    home: { zip_code: '01000' },
    others: [{ zip_code: '02000' }, null],
    visits: ['2026-01-02'],
  };

  it('map nested objects and lists in both directions', () => {
    const person = mapObject(personMapping, dto, 'toFront', DEFAULT_MAPPER_CONFIG);

    expect(person).toEqual({
      home: { zipCode: '01000' },
      others: [{ zipCode: '02000' }, null],
      visits: [new Date(2026, 0, 2)],
    });
    expect(mapObject(personMapping, person, 'toBack', DEFAULT_MAPPER_CONFIG)).toEqual(dto);
  });

  it('keep null nested values as null', () => {
    expect(mapObject(personMapping, { home: null }, 'toFront', DEFAULT_MAPPER_CONFIG)).toEqual({
      home: null,
    });
  });

  it('apply the nested mapping options and report full paths', () => {
    const invalid = { others: [{ zip_code: '1' }, { zip_code: '2', geo: {} }] };
    const error = (() => {
      try {
        mapObject(personMapping, invalid, 'toFront', DEFAULT_MAPPER_CONFIG, 'people[0]');
      } catch (caught) {
        return caught as MapperError;
      }
      throw new Error('Expected a MapperError.');
    })();

    expect(error.code).toBe('MAPPER_UNKNOWN_FIELD');
    expect(error.mapping).toBe('address');
    expect(error.path).toBe('people[0].others[1].geo');
  });

  it('wrap list item failures with the item index', () => {
    expect(() =>
      mapObject(
        personMapping,
        { visits: ['2026-01-01', 'soon'] },
        'toFront',
        DEFAULT_MAPPER_CONFIG,
      ),
    ).toThrow(expect.objectContaining({ code: 'MAPPER_TRANSFORM_FAILED', path: 'visits[1]' }));
  });

  it('reject non-array values given to listOf', () => {
    expect(() => toFront(listOf(isoDate()), 'x')).toThrow('Expected an array, got "x".');
  });
});
