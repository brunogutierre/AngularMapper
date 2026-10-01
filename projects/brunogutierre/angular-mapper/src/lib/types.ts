/**
 * Direction of a conversion: `toFront` turns backend data into frontend models, `toBack` does
 * the opposite.
 *
 * @publicApi
 */
export type MappingDirection = 'toFront' | 'toBack';

/**
 * What to do with fields that a mapping does not declare:
 *
 * - `keep`: copy them unchanged (default).
 * - `convert`: copy them, renaming keys (deeply) with the active naming convention.
 * - `drop`: leave them out of the output.
 * - `error`: throw a `MAPPER_UNKNOWN_FIELD` error (strict mode).
 *
 * @publicApi
 */
export type UndeclaredFieldPolicy = 'keep' | 'convert' | 'drop' | 'error';

/**
 * Converts property names between the frontend convention (camelCase) and the backend one.
 *
 * @publicApi
 */
export interface NamingConvention {
  /** Turns a backend key (e.g. `user_id`) into a frontend key (e.g. `userId`). */
  toFront(key: string): string;
  /** Turns a frontend key (e.g. `userId`) into a backend key (e.g. `user_id`). */
  toBack(key: string): string;
}

/**
 * Name of a built-in naming convention used by the backend.
 *
 * @publicApi
 */
export type NamingConventionName = 'camelCase' | 'snake_case' | 'kebab-case' | 'PascalCase';

/**
 * Resolved configuration used while mapping. Provided globally with `provideMapper()` and
 * overridable per mapping.
 *
 * @publicApi
 */
export interface MapperConfig {
  readonly undeclared: UndeclaredFieldPolicy;
  readonly convention: NamingConvention;
}

/**
 * Information handed to a {@link Transformer} for each value it converts.
 *
 * @publicApi
 */
export interface MappingContext {
  /** Name of the mapping currently being applied. */
  readonly mapping: string;
  /** Dotted path of the value from the root object, e.g. `addresses[0].zipCode`. */
  readonly path: string;
  /** Direction of the conversion in progress. */
  readonly direction: MappingDirection;
  /** Configuration in effect for the root mapping. */
  readonly config: MapperConfig;
}

/**
 * A bidirectional converter between a backend value `B` and a frontend value `F`.
 *
 * Both directions live in one object so they cannot drift apart. Transformers never receive
 * `null` or `undefined`: the mapper passes `null` through and omits `undefined` on its own.
 *
 * @publicApi
 */
export interface Transformer<B, F> {
  toFront(value: B, context: MappingContext): F;
  toBack(value: F, context: MappingContext): B;
}

/** Keys of `T` that are strings: the only ones that survive JSON. */
type StringKeyOf<T> = Extract<keyof T, string>;

/** `true` when `A` and `B` are mutually assignable, ignoring `null` and `undefined`. */
type Compatible<A, B> = [NonNullable<A>] extends [NonNullable<B>]
  ? [NonNullable<B>] extends [NonNullable<A>]
    ? true
    : false
  : false;

/** Restricts a field to a single direction. Omit to map it both ways. */
interface DirectionOption {
  /**
   * Map this field only in the given direction. For example `only: 'toFront'` reads a
   * server-generated `id` but never sends it back.
   */
  readonly only?: MappingDirection;
}

/**
 * A field read from backend key `BK` and converted with a transformer.
 *
 * @publicApi
 */
export interface TransformedField<BK extends string, BV, FV> extends DirectionOption {
  readonly from: BK;
  readonly transform: Transformer<NonNullable<BV>, NonNullable<FV>>;
}

/**
 * A field copied as-is from backend key `BK`; allowed only when both sides share a type.
 *
 * @publicApi
 */
export interface RenamedField<BK extends string> extends DirectionOption {
  readonly from: BK;
  readonly transform?: undefined;
}

/**
 * Marker for frontend-only fields that must never be sent to the backend. Create it with
 * `ignore()`.
 *
 * @publicApi
 */
export interface IgnoredField {
  readonly ignore: true;
}

/** Every valid object form for a frontend field whose value type is `FV`. */
type FieldObject<B, FV> = {
  [BK in StringKeyOf<B>]-?:
    | TransformedField<BK, B[BK], FV>
    | (Compatible<B[BK], FV> extends true ? RenamedField<BK> : never);
}[StringKeyOf<B>];

/** Backend keys whose type is compatible with `FV`, usable as a plain rename. */
type RenameKey<B, FV> = {
  [BK in StringKeyOf<B>]-?: Compatible<B[BK], FV> extends true ? BK : never;
}[StringKeyOf<B>];

/**
 * How a single frontend field is mapped:
 *
 * - a backend key with a compatible type (`name: 'full_name'`);
 * - `{ from, transform }` to convert the value (`birth: { from: 'birth_date', transform: isoDate() }`);
 * - `{ from, only }` to map in one direction only;
 * - `ignore()` for frontend-only fields.
 *
 * @publicApi
 */
export type FieldSpec<B, FV> = RenameKey<B, FV> | FieldObject<B, FV> | IgnoredField;

/**
 * The mapping table between a backend DTO `B` and a frontend model `F`, keyed by frontend
 * field. Fields left out follow the undeclared-field policy.
 *
 * @publicApi
 */
export type MappingSpec<B, F> = {
  readonly [K in StringKeyOf<F>]?: FieldSpec<B, F[K]>;
};

/**
 * Per-mapping overrides of the global configuration.
 *
 * @publicApi
 */
export interface MappingOptions {
  /** Policy for undeclared fields of this mapping only. */
  readonly undeclared?: UndeclaredFieldPolicy;
  /** Naming convention of this mapping only. */
  readonly convention?: NamingConventionName | NamingConvention;
}

declare const MAPPING_TYPES: unique symbol;

/**
 * A compiled, immutable mapping between backend DTO `B` and frontend model `F`. Create one
 * with `defineMapping()` and pass it to the `Mapper` methods: its types drive inference.
 *
 * @publicApi
 */
export interface Mapping<B, F> {
  /** Label used in error messages. */
  readonly name: string;
  /** Options given to `defineMapping()`. */
  readonly options: MappingOptions;
  /** Phantom property carrying the mapped types; never present at runtime. */
  readonly [MAPPING_TYPES]?: { readonly back: B; readonly front: F };
}

/**
 * Extracts the backend type of a mapping.
 *
 * @publicApi
 */
export type BackOf<M> = M extends Mapping<infer B, unknown> ? B : never;

/**
 * Extracts the frontend type of a mapping.
 *
 * @publicApi
 */
export type FrontOf<M> = M extends Mapping<unknown, infer F> ? F : never;
