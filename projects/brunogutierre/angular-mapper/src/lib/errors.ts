/**
 * Machine-readable codes carried by every {@link MapperError}.
 *
 * - `MAPPER_INVALID_MAPPING`: a mapping definition is inconsistent (detected by `defineMapping`).
 * - `MAPPER_INVALID_CONFIG`: `provideMapper()` received invalid or duplicated features.
 * - `MAPPER_INVALID_INPUT`: the value handed to the mapper is not a plain object (or array, for
 *   list methods).
 * - `MAPPER_UNKNOWN_FIELD`: strict mode met a field that the mapping does not declare.
 * - `MAPPER_TRANSFORM_FAILED`: a transformer threw while converting a field.
 * - `MAPPER_ALREADY_PROVIDED`: `provideMapper()` was used below the root injector.
 *
 * @publicApi
 */
export type MapperErrorCode =
  | 'MAPPER_INVALID_MAPPING'
  | 'MAPPER_INVALID_CONFIG'
  | 'MAPPER_INVALID_INPUT'
  | 'MAPPER_UNKNOWN_FIELD'
  | 'MAPPER_TRANSFORM_FAILED'
  | 'MAPPER_ALREADY_PROVIDED';

/**
 * Optional details attached to a {@link MapperError}.
 *
 * @publicApi
 */
export interface MapperErrorDetails {
  /** Name of the mapping being applied when the error happened. */
  readonly mapping?: string;
  /** Dotted path of the field that failed, e.g. `addresses[0].zipCode`. */
  readonly path?: string;
  /** The original error, when the failure was caused by another error. */
  readonly cause?: unknown;
}

/**
 * The single error type thrown by the library. Inspect `code` to react programmatically and
 * `mapping` / `path` to locate the offending field.
 *
 * @publicApi
 */
export class MapperError extends Error {
  override readonly name = 'MapperError';
  readonly mapping: string | undefined;
  readonly path: string | undefined;

  constructor(
    readonly code: MapperErrorCode,
    message: string,
    details: MapperErrorDetails = {},
  ) {
    super(formatMessage(code, message, details), { cause: details.cause });
    this.mapping = details.mapping;
    this.path = details.path;
  }
}

function formatMessage(
  code: MapperErrorCode,
  message: string,
  details: MapperErrorDetails,
): string {
  const location = [details.mapping, details.path].filter(Boolean).join(' › ');
  return location ? `${code}: [${location}] ${message}` : `${code}: ${message}`;
}
