import { DEFAULT_MAPPER_CONFIG } from './config';
import { defineMapping, ignore } from './define-mapping';
import { isPlainObject, mapList, mapObject } from './engine';
import { MapperError } from './errors';
import type { MapperConfig, MappingContext, NamingConvention, Transformer } from './types';

interface UserDto {
  user_id: number;
  full_name: string;
  score: string | null;
  created_at?: string;
}

interface User {
  id: number;
  name: string;
  score: number | null;
  createdAt?: string;
  selected: boolean;
}

const numberString: Transformer<string, number> = {
  toFront: (value) => Number(value),
  toBack: (value) => String(value),
};

const userMapping = defineMapping<UserDto, User>('user', {
  id: 'user_id',
  name: 'full_name',
  score: { from: 'score', transform: numberString },
  createdAt: { from: 'created_at', only: 'toFront' },
  selected: ignore(),
});

const upperSnake: NamingConvention = {
  toFront: (key) => key.toLowerCase(),
  toBack: (key) => key.toUpperCase(),
};

const config = (overrides: Partial<MapperConfig> = {}): MapperConfig => ({
  ...DEFAULT_MAPPER_CONFIG,
  ...overrides,
});

function catchError(fn: () => unknown): MapperError {
  try {
    fn();
  } catch (error) {
    if (error instanceof MapperError) return error;
    throw error;
  }
  throw new Error('Expected a MapperError to be thrown.');
}

describe('mapObject', () => {
  const dto: UserDto = { user_id: 1, full_name: 'Ada', score: '42', created_at: '2026-01-01' };

  it('renames and transforms fields toward the frontend', () => {
    expect(mapObject(userMapping, dto, 'toFront', config())).toEqual({
      id: 1,
      name: 'Ada',
      score: 42,
      createdAt: '2026-01-01',
    });
  });

  it('renames and transforms fields toward the backend', () => {
    const user: User = { id: 1, name: 'Ada', score: 42, createdAt: 'x', selected: true };
    expect(mapObject(userMapping, user, 'toBack', config())).toEqual({
      user_id: 1,
      full_name: 'Ada',
      score: '42',
    });
  });

  it('round-trips a value', () => {
    const user = mapObject(userMapping, dto, 'toFront', config());
    expect(mapObject(userMapping, user, 'toBack', config())).toEqual({
      user_id: 1,
      full_name: 'Ada',
      score: '42',
    });
  });

  it('passes null through without calling the transformer', () => {
    const toFront = vi.fn();
    const mapping = defineMapping<UserDto, User>('user', {
      score: { from: 'score', transform: { toFront, toBack: vi.fn() } },
    });

    expect(mapObject(mapping, { score: null }, 'toFront', config())).toEqual({ score: null });
    expect(toFront).not.toHaveBeenCalled();
  });

  it('omits missing and undefined fields, which keeps partial payloads partial', () => {
    expect(mapObject(userMapping, { name: 'Ada', score: undefined }, 'toBack', config())).toEqual({
      full_name: 'Ada',
    });
  });

  it('hands transformers a context with mapping, path, direction and config', () => {
    const contexts: MappingContext[] = [];
    const spy: Transformer<string, number> = {
      toFront: (value, context) => (contexts.push(context), Number(value)),
      toBack: String,
    };
    const mapping = defineMapping<UserDto, User>('user', {
      score: { from: 'score', transform: spy },
    });
    const global = config();

    mapObject(mapping, { score: '1' }, 'toFront', global, 'root[2]');

    expect(contexts).toEqual([
      { mapping: 'user', path: 'root[2].score', direction: 'toFront', config: global },
    ]);
  });

  it('never mutates its input', () => {
    const input = Object.freeze({ ...dto, extra: Object.freeze({ a: 1 }) });
    const output = mapObject(userMapping, input, 'toFront', config());

    expect(input).toEqual({ ...dto, extra: { a: 1 } });
    expect(output).not.toBe(input);
  });

  it('accepts class instances and reads declared fields through getters', () => {
    class UserModel {
      id = 7;
      first = 'Ada';
      get name(): string {
        return `${this.first} Lovelace`;
      }
    }

    expect(mapObject(userMapping, new UserModel(), 'toBack', config())).toEqual({
      first: 'Ada',
      user_id: 7,
      full_name: 'Ada Lovelace',
    });
  });

  it('treats a __proto__ key from JSON as a regular property', () => {
    const input: unknown = JSON.parse('{"user_id": 1, "__proto__": {"polluted": true}}');
    const output = mapObject(userMapping, input, 'toFront', config());

    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.keys(output)).toEqual(['__proto__', 'id']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it.each([
    ['null', null, 'null'],
    ['an array', [dto], 'an array'],
    ['a string', 'dto', 'string'],
  ])('rejects %s as input', (_, input, described) => {
    const error = catchError(() => mapObject(userMapping, input, 'toFront', config()));
    expect(error.code).toBe('MAPPER_INVALID_INPUT');
    expect(error.message).toContain(`Expected an object, got ${described}.`);
  });

  describe('one-way and ignored fields', () => {
    it('reads toFront-only fields but never sends them back', () => {
      const output = mapObject(userMapping, { createdAt: 'x' }, 'toBack', config());
      expect(output).toEqual({});
    });

    it('sends toBack-only fields but drops the backend key when reading', () => {
      const mapping = defineMapping<UserDto, User>('user', {
        name: { from: 'full_name', only: 'toBack' },
      });

      expect(mapObject(mapping, { full_name: 'Ada' }, 'toFront', config())).toEqual({});
      expect(mapObject(mapping, { name: 'Ada' }, 'toBack', config())).toEqual({ full_name: 'Ada' });
    });

    it('never sends ignored fields, even when undeclared fields are kept', () => {
      expect(mapObject(userMapping, { selected: true }, 'toBack', config())).toEqual({});
    });
  });

  describe('undeclared fields', () => {
    const input = { user_id: 1, nick_name: 'ada', tags: [{ tag_name: 'x' }] };

    it('keeps them unchanged by default', () => {
      expect(mapObject(userMapping, input, 'toFront', config())).toEqual({
        id: 1,
        nick_name: 'ada',
        tags: [{ tag_name: 'x' }],
      });
    });

    it('drops them', () => {
      expect(mapObject(userMapping, input, 'toFront', config({ undeclared: 'drop' }))).toEqual({
        id: 1,
      });
    });

    it('throws MAPPER_UNKNOWN_FIELD in strict mode', () => {
      const error = catchError(() =>
        mapObject(userMapping, input, 'toFront', config({ undeclared: 'error' }), 'users[0]'),
      );

      expect(error.code).toBe('MAPPER_UNKNOWN_FIELD');
      expect(error.path).toBe('users[0].nick_name');
    });

    it('converts keys deeply through objects and arrays', () => {
      const output = mapObject(
        userMapping,
        input,
        'toBack',
        config({ undeclared: 'convert', convention: upperSnake }),
      );

      expect(output).toEqual({ NICK_NAME: 'ada', TAGS: [{ TAG_NAME: 'x' }], USER_ID: 1 });
    });

    it('leaves non-plain values such as dates untouched while converting', () => {
      const date = new Date(0);
      const output = mapObject(
        userMapping,
        { when: date },
        'toBack',
        config({ undeclared: 'convert', convention: upperSnake }),
      );

      expect(output['WHEN']).toBe(date);
    });

    it('lets declared fields win key collisions', () => {
      const mapping = defineMapping<UserDto, User>('user', { name: 'full_name' });
      expect(
        mapObject(
          mapping,
          { name: 'Ada', NAME: 'raw' },
          'toBack',
          config({ undeclared: 'convert', convention: upperSnake }),
        ),
      ).toEqual({ NAME: 'raw', full_name: 'Ada' });
    });
  });

  describe('per-mapping options', () => {
    it('override the global policy and convention', () => {
      const mapping = defineMapping<UserDto, User>(
        'user',
        { id: 'user_id' },
        { undeclared: 'convert', convention: upperSnake },
      );

      expect(
        mapObject(mapping, { id: 1, nickName: 'ada' }, 'toBack', config({ undeclared: 'error' })),
      ).toEqual({
        user_id: 1,
        NICKNAME: 'ada',
      });
    });
  });

  describe('transformer failures', () => {
    const failing = (error: unknown): Transformer<string, number> => ({
      toFront: () => {
        throw error;
      },
      toBack: String,
    });

    it('are wrapped in MAPPER_TRANSFORM_FAILED with the field path and cause', () => {
      const cause = new RangeError('not a number');
      const mapping = defineMapping<UserDto, User>('user', {
        score: { from: 'score', transform: failing(cause) },
      });
      const error = catchError(() =>
        mapObject(mapping, { score: 'x' }, 'toFront', config(), 'list[3]'),
      );

      expect(error.code).toBe('MAPPER_TRANSFORM_FAILED');
      expect(error.path).toBe('list[3].score');
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('Transformer failed (toFront): not a number');
    });

    it('describe thrown non-errors', () => {
      const mapping = defineMapping<UserDto, User>('user', {
        score: { from: 'score', transform: failing('nope') },
      });
      expect(
        catchError(() => mapObject(mapping, { score: 'x' }, 'toFront', config())).message,
      ).toContain(': nope');
    });

    it('rethrow MapperErrors untouched so nested paths are preserved', () => {
      const inner = new MapperError('MAPPER_UNKNOWN_FIELD', 'inner', { path: 'a.b.c' });
      const mapping = defineMapping<UserDto, User>('user', {
        score: { from: 'score', transform: failing(inner) },
      });

      expect(catchError(() => mapObject(mapping, { score: 'x' }, 'toFront', config()))).toBe(inner);
    });
  });
});

describe('mapList', () => {
  it('maps every element', () => {
    const output = mapList(userMapping, [{ user_id: 1 }, { user_id: 2 }], 'toFront', config());
    expect(output).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('reports the failing index in the error path', () => {
    const error = catchError(() =>
      mapList(userMapping, [{ user_id: 1 }, null], 'toFront', config()),
    );

    expect(error.code).toBe('MAPPER_INVALID_INPUT');
    expect(error.path).toBe('[1]');
  });

  it('rejects non-array input', () => {
    const error = catchError(() => mapList(userMapping, { user_id: 1 }, 'toFront', config()));

    expect(error.code).toBe('MAPPER_INVALID_INPUT');
    expect(error.message).toContain('Expected an array, got an instance of Object.');
  });
});

describe('isPlainObject', () => {
  it.each([
    [{}, true],
    [Object.create(null), true],
    [JSON.parse('{"a":1}'), true],
    [[], false],
    [new Date(), false],
    [null, false],
    ['x', false],
  ])('%o → %s', (value, expected) => {
    expect(isPlainObject(value)).toBe(expected);
  });
});
