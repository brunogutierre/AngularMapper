import { getCompiled } from './compiled-mapping';
import { defineMapping, ignore } from './define-mapping';
import { MapperError } from './errors';
import type { Mapping, Transformer } from './types';

interface Dto {
  user_id: number;
  full_name: string;
  created_at: string;
}

interface Model {
  id: number;
  name: string;
  createdAt: string;
  label: string;
  selected: boolean;
}

const upper: Transformer<string, string> = {
  toFront: (value) => value.toUpperCase(),
  toBack: (value) => value.toLowerCase(),
};

/** Builds a mapping from an untyped spec to exercise runtime validation. */
function defineLoose(spec: Record<string, unknown>): Mapping<Dto, Model> {
  return defineMapping<Dto, Model>('loose', spec);
}

function catchError(fn: () => unknown): MapperError {
  try {
    fn();
  } catch (error) {
    if (error instanceof MapperError) return error;
    throw error;
  }
  throw new Error('Expected a MapperError to be thrown.');
}

describe('defineMapping', () => {
  it('returns a frozen mapping carrying its name and options', () => {
    const mapping = defineMapping<Dto, Model>('user', { id: 'user_id' }, { undeclared: 'drop' });

    expect(mapping.name).toBe('user');
    expect(mapping.options).toEqual({ undeclared: 'drop' });
    expect(Object.isFrozen(mapping)).toBe(true);
    expect(Object.isFrozen(mapping.options)).toBe(true);
  });

  it('compiles renames, transformed, one-way and ignored fields', () => {
    const mapping = defineMapping<Dto, Model>('user', {
      id: 'user_id',
      name: { from: 'full_name', transform: upper },
      createdAt: { from: 'created_at', only: 'toFront' },
      selected: ignore(),
    });

    const compiled = getCompiled(mapping);
    expect(compiled.fields).toEqual([
      { front: 'id', back: 'user_id', transform: undefined, only: undefined },
      { front: 'name', back: 'full_name', transform: upper, only: undefined },
      { front: 'createdAt', back: 'created_at', transform: undefined, only: 'toFront' },
    ]);
    expect([...compiled.frontKeys]).toEqual(['id', 'name', 'createdAt', 'selected']);
    expect([...compiled.backKeys]).toEqual(['user_id', 'full_name', 'created_at']);
  });

  it('skips entries explicitly set to undefined', () => {
    const compiled = getCompiled(defineLoose({ id: 'user_id', name: undefined }));
    expect(compiled.fields.map((field) => field.front)).toEqual(['id']);
  });

  it('allows several fields to read the same backend key when only one sends it back', () => {
    expect(() =>
      defineLoose({
        name: 'full_name',
        label: { from: 'full_name', transform: upper, only: 'toFront' },
      }),
    ).not.toThrow();
  });

  it('rejects two fields writing the same backend key', () => {
    const error = catchError(() => defineLoose({ name: 'full_name', label: 'full_name' }));

    expect(error.code).toBe('MAPPER_INVALID_MAPPING');
    expect(error.mapping).toBe('loose');
    expect(error.message).toContain('"name" and "label" both write backend key "full_name"');
  });

  it.each([
    ['an empty name', () => defineMapping<Dto, Model>('  ', {})],
    ['a number entry', () => defineLoose({ id: 42 })],
    ['a null entry', () => defineLoose({ id: null })],
    ['a missing "from"', () => defineLoose({ id: { transform: upper } })],
    ['an empty "from"', () => defineLoose({ id: { from: '' } })],
    [
      'a transformer without toBack',
      () => defineLoose({ id: { from: 'user_id', transform: { toFront: String } } }),
    ],
    ['an unknown direction', () => defineLoose({ id: { from: 'user_id', only: 'sideways' } })],
  ])('rejects %s', (_, define) => {
    expect(catchError(define).code).toBe('MAPPER_INVALID_MAPPING');
  });

  it('reports the offending field in the error path', () => {
    const error = catchError(() => defineLoose({ id: { from: 'user_id', only: 'sideways' } }));
    expect(error.path).toBe('id');
    expect(error.message).toBe(
      `MAPPER_INVALID_MAPPING: [loose › id] Invalid field spec: "only" must be 'toFront' or 'toBack'.`,
    );
  });
});

describe('getCompiled', () => {
  it('rejects objects not created with defineMapping', () => {
    const forged = { name: 'forged', options: {} } as Mapping<Dto, Model>;
    const error = catchError(() => getCompiled(forged));

    expect(error.code).toBe('MAPPER_INVALID_MAPPING');
    expect(error.mapping).toBe('forged');
  });
});

describe('MapperError', () => {
  it('is an Error with a code, location and cause', () => {
    const cause = new TypeError('boom');
    const error = new MapperError('MAPPER_TRANSFORM_FAILED', 'Could not convert.', {
      mapping: 'user',
      path: 'address.zip',
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MapperError');
    expect(error.code).toBe('MAPPER_TRANSFORM_FAILED');
    expect(error.mapping).toBe('user');
    expect(error.path).toBe('address.zip');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('MAPPER_TRANSFORM_FAILED: [user › address.zip] Could not convert.');
  });

  it('omits the location when none is known', () => {
    const error = new MapperError('MAPPER_ALREADY_PROVIDED', 'Provided twice.');
    expect(error.message).toBe('MAPPER_ALREADY_PROVIDED: Provided twice.');
    expect(error.mapping).toBeUndefined();
  });
});
