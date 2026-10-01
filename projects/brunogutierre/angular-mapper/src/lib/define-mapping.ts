import { registerCompiled, type CompiledField } from './compiled-mapping';
import { MapperError } from './errors';
import { resolveNamingConvention } from './naming';
import type {
  IgnoredField,
  Mapping,
  MappingOptions,
  MappingSpec,
  NamingConvention,
  Transformer,
} from './types';

const IGNORED: IgnoredField = Object.freeze({ ignore: true });

/**
 * Marks a frontend-only field (UI state, derived values) that is never sent to the backend.
 *
 * @usageNotes
 * ```ts
 * defineMapping<UserDto, User>('user', { selected: ignore() });
 * ```
 *
 * @publicApi
 */
export function ignore(): IgnoredField {
  return IGNORED;
}

/**
 * Declares the mapping table between a backend DTO `B` and a frontend model `F`.
 *
 * The spec is keyed by frontend field. Each entry names the backend key it comes from and,
 * when the types differ, the transformer that converts it. The returned object is immutable
 * and is what you pass to `Mapper.toFront()` / `Mapper.toBack()`.
 *
 * @param name Label used in error messages.
 * @param spec Field-by-field mapping table.
 * @param options Per-mapping overrides of the global configuration.
 * @throws {MapperError} `MAPPER_INVALID_MAPPING` when the spec is inconsistent.
 *
 * @usageNotes
 * ```ts
 * export const userMapping = defineMapping<UserDto, User>('user', {
 *   id: 'user_id',
 *   birthDate: { from: 'birth_date', transform: isoDate() },
 *   createdAt: { from: 'created_at', transform: isoDate(), only: 'toFront' },
 *   selected: ignore(),
 * });
 * ```
 *
 * @publicApi
 */
export function defineMapping<B extends object, F extends object>(
  name: string,
  spec: MappingSpec<B, F>,
  options: MappingOptions = {},
): Mapping<B, F> {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new MapperError('MAPPER_INVALID_MAPPING', 'A mapping needs a non-empty name.');
  }

  validateOptions(name, options);

  const fields: CompiledField[] = [];
  const frontKeys = new Set<string>();
  const backKeys = new Set<string>();
  const ignoredKeys = new Set<string>();
  const sentBack = new Map<string, string>();

  for (const [front, entry] of Object.entries(spec as Record<string, unknown>)) {
    if (entry === undefined) continue;
    frontKeys.add(front);
    if (isIgnored(entry)) {
      ignoredKeys.add(front);
      continue;
    }

    const field = compileField(name, front, entry);
    fields.push(field);
    backKeys.add(field.back);

    if (field.only !== 'toFront') {
      const previous = sentBack.get(field.back);
      if (previous !== undefined) {
        throw new MapperError(
          'MAPPER_INVALID_MAPPING',
          `Fields "${previous}" and "${front}" both write backend key "${field.back}". ` +
            `Mark one of them with only: 'toFront'.`,
          { mapping: name },
        );
      }
      sentBack.set(field.back, front);
    }
  }

  const mapping: Mapping<B, F> = Object.freeze({ name, options: Object.freeze({ ...options }) });
  registerCompiled(
    mapping,
    Object.freeze({
      fields: Object.freeze(fields),
      frontKeys,
      backKeys,
      ignoredKeys,
      undeclared: options.undeclared,
      convention: resolveConvention(name, options),
      resolved: new WeakMap(),
    }),
  );
  return mapping;
}

const POLICIES: readonly unknown[] = ['keep', 'convert', 'drop', 'error'];

function validateOptions(mapping: string, options: MappingOptions): void {
  if (options.undeclared !== undefined && !POLICIES.includes(options.undeclared)) {
    throw new MapperError(
      'MAPPER_INVALID_MAPPING',
      `"undeclared" must be one of ${POLICIES.join(', ')}.`,
      { mapping },
    );
  }
}

function resolveConvention(mapping: string, options: MappingOptions): NamingConvention | undefined {
  if (options.convention === undefined) return undefined;
  try {
    return resolveNamingConvention(options.convention);
  } catch (error) {
    throw new MapperError('MAPPER_INVALID_MAPPING', (error as Error).message, {
      mapping,
      cause: error,
    });
  }
}

function compileField(mapping: string, front: string, entry: unknown): CompiledField {
  if (typeof entry === 'string') {
    if (entry === '') throw invalid(mapping, front, 'the backend key must not be empty');
    return { front, back: entry, transform: undefined, only: undefined };
  }
  if (typeof entry !== 'object' || entry === null) {
    throw invalid(mapping, front, 'expected a backend key, an object with "from", or ignore()');
  }

  const { from, transform, only } = entry as {
    from?: unknown;
    transform?: unknown;
    only?: unknown;
  };
  if (typeof from !== 'string' || from === '') {
    throw invalid(mapping, front, '"from" must be a non-empty backend key');
  }
  if (transform !== undefined && !isTransformer(transform)) {
    throw invalid(mapping, front, '"transform" must define toFront() and toBack()');
  }
  if (only !== undefined && only !== 'toFront' && only !== 'toBack') {
    throw invalid(mapping, front, `"only" must be 'toFront' or 'toBack'`);
  }
  return { front, back: from, transform, only };
}

function isIgnored(entry: unknown): entry is IgnoredField {
  return typeof entry === 'object' && entry !== null && 'ignore' in entry && entry.ignore === true;
}

function isTransformer(value: unknown): value is Transformer<unknown, unknown> {
  const candidate = value as Partial<Transformer<unknown, unknown>> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.toFront === 'function' &&
    typeof candidate.toBack === 'function'
  );
}

function invalid(mapping: string, path: string, reason: string): MapperError {
  return new MapperError('MAPPER_INVALID_MAPPING', `Invalid field spec: ${reason}.`, {
    mapping,
    path,
  });
}
