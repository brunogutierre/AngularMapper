import { MapperError } from './errors';
import type {
  MapperConfig,
  Mapping,
  MappingDirection,
  NamingConvention,
  Transformer,
  UndeclaredFieldPolicy,
} from './types';

/** One declared field, normalized from the user-facing spec. */
export interface CompiledField {
  readonly front: string;
  readonly back: string;
  readonly transform: Transformer<unknown, unknown> | undefined;
  readonly only: MappingDirection | undefined;
}

/** Lookup-friendly form of a mapping, built once by `defineMapping()`. */
export interface CompiledMapping {
  readonly fields: readonly CompiledField[];
  /** Frontend keys consumed by declared or ignored fields. */
  readonly frontKeys: ReadonlySet<string>;
  /** Backend keys consumed by declared fields. */
  readonly backKeys: ReadonlySet<string>;
  /** Frontend keys marked with `ignore()`; never filled from undeclared backend fields. */
  readonly ignoredKeys: ReadonlySet<string>;
  /** Per-mapping policy override, if any. */
  readonly undeclared: UndeclaredFieldPolicy | undefined;
  /** Per-mapping convention override, resolved once. */
  readonly convention: NamingConvention | undefined;
  /** Effective configuration per global configuration, computed lazily. */
  readonly resolved: WeakMap<MapperConfig, MapperConfig>;
}

const registry = new WeakMap<Mapping<unknown, unknown>, CompiledMapping>();

export function registerCompiled(
  mapping: Mapping<unknown, unknown>,
  compiled: CompiledMapping,
): void {
  registry.set(mapping, compiled);
}

/** Returns the compiled form of a mapping, rejecting objects not created by `defineMapping()`. */
export function getCompiled(mapping: Mapping<unknown, unknown>): CompiledMapping {
  const compiled = registry.get(mapping);
  if (!compiled) {
    throw new MapperError(
      'MAPPER_INVALID_MAPPING',
      'Expected a mapping created with defineMapping().',
      { mapping: describe(mapping) },
    );
  }
  return compiled;
}

function describe(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    return String(value.name);
  }
  return undefined;
}
