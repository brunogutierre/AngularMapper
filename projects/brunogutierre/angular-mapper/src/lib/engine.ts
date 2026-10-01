import { getCompiled, type CompiledField } from './compiled-mapping';
import { MapperError } from './errors';
import type {
  MapperConfig,
  Mapping,
  MappingContext,
  MappingDirection,
  NamingConvention,
  UndeclaredFieldPolicy,
} from './types';

type PlainObject = Record<string, unknown>;

/**
 * Applies `mapping` to a single object in the given direction.
 *
 * Pure function: the input is never mutated and a new plain object is returned. The input may be
 * a plain object or a class instance (declared fields are read through getters too). `null` values
 * are copied as `null` without calling transformers; `undefined` values and missing keys are
 * left out, which is what makes partial (PATCH) payloads work.
 *
 * @param config Global configuration; the mapping's own options take precedence over it.
 * @param path Location of `input` inside the root value, used in error messages.
 */
export function mapObject(
  mapping: Mapping<unknown, unknown>,
  input: unknown,
  direction: MappingDirection,
  config: MapperConfig,
  path = '',
): PlainObject {
  const compiled = getCompiled(mapping);
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new MapperError('MAPPER_INVALID_INPUT', `Expected an object, got ${describe(input)}.`, {
      mapping: mapping.name,
      path: path || undefined,
    });
  }

  const { undeclared, convention } = resolveConfig(mapping, config);
  const consumed = direction === 'toFront' ? compiled.backKeys : compiled.frontKeys;
  const output: PlainObject = {};

  // Undeclared fields go first so that declared fields win any key collision.
  for (const [key, value] of Object.entries(input)) {
    if (consumed.has(key) || value === undefined) continue;
    copyUndeclared(output, key, value, { undeclared, convention, direction, mapping, path });
  }

  for (const field of compiled.fields) {
    if (field.only !== undefined && field.only !== direction) continue;
    const [source, target] =
      direction === 'toFront' ? [field.back, field.front] : [field.front, field.back];
    const value: unknown = Reflect.get(input, source);
    if (value === undefined) continue;
    const context: MappingContext = {
      mapping: mapping.name,
      path: join(path, field.front),
      direction,
      config,
    };
    setOwn(output, target, value === null ? null : transform(field, value, context));
  }

  return output;
}

/**
 * Applies `mapping` to every element of an array, reporting failures with their index.
 */
export function mapList(
  mapping: Mapping<unknown, unknown>,
  input: unknown,
  direction: MappingDirection,
  config: MapperConfig,
  path = '',
): PlainObject[] {
  if (!Array.isArray(input)) {
    throw new MapperError('MAPPER_INVALID_INPUT', `Expected an array, got ${describe(input)}.`, {
      mapping: mapping.name,
      path: path || undefined,
    });
  }
  return input.map((item, index) =>
    mapObject(mapping, item, direction, config, `${path}[${String(index)}]`),
  );
}

/** Effective configuration of a mapping: its own options over the global config. */
export function resolveConfig(
  mapping: Mapping<unknown, unknown>,
  config: MapperConfig,
): MapperConfig {
  const { undeclared, convention } = mapping.options;
  if (undeclared === undefined && convention === undefined) return config;
  if (typeof convention === 'string') {
    throw new MapperError('MAPPER_INVALID_MAPPING', `Unknown naming convention "${convention}".`, {
      mapping: mapping.name,
    });
  }
  return {
    undeclared: undeclared ?? config.undeclared,
    convention: convention ?? config.convention,
  };
}

/** `true` for object literals, `JSON.parse` results and `Object.create(null)` objects. */
export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface UndeclaredContext {
  readonly undeclared: UndeclaredFieldPolicy;
  readonly convention: NamingConvention;
  readonly direction: MappingDirection;
  readonly mapping: Mapping<unknown, unknown>;
  readonly path: string;
}

function copyUndeclared(
  output: PlainObject,
  key: string,
  value: unknown,
  context: UndeclaredContext,
): void {
  switch (context.undeclared) {
    case 'keep':
      setOwn(output, key, value);
      return;
    case 'drop':
      return;
    case 'convert':
      setOwn(output, context.convention[context.direction](key), convertKeys(value, context));
      return;
    case 'error':
      throw new MapperError(
        'MAPPER_UNKNOWN_FIELD',
        `Field "${key}" is not declared in the mapping.`,
        {
          mapping: context.mapping.name,
          path: join(context.path, key),
        },
      );
  }
}

/** Renames keys of plain objects (deeply, through arrays) with the active convention. */
function convertKeys(value: unknown, context: UndeclaredContext): unknown {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, context));
  if (!isPlainObject(value)) return value;

  const output: PlainObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined)
      setOwn(output, context.convention[context.direction](key), convertKeys(item, context));
  }
  return output;
}

function transform(field: CompiledField, value: unknown, context: MappingContext): unknown {
  if (field.transform === undefined) return value;
  try {
    return field.transform[context.direction](value, context);
  } catch (error) {
    if (error instanceof MapperError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new MapperError(
      'MAPPER_TRANSFORM_FAILED',
      `Transformer failed (${context.direction}): ${reason}`,
      {
        mapping: context.mapping,
        path: context.path,
        cause: error,
      },
    );
  }
}

/**
 * Defines an own, enumerable property. Unlike `output[key] = value`, a `__proto__` key coming
 * from untrusted JSON becomes a regular property instead of replacing the prototype.
 */
function setOwn(output: PlainObject, key: string, value: unknown): void {
  Object.defineProperty(output, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return `an instance of ${value.constructor.name}`;
  return typeof value;
}
