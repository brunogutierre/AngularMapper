/*
 * Public API Surface of @brunogutierre/angular-mapper
 */

export { defineMapping, ignore } from './lib/define-mapping';
export { MapperError } from './lib/errors';
export { MAPPER_CONFIG, Mapper } from './lib/mapper';
export { provideMapper, withNamingConvention, withStrictMode } from './lib/provide-mapper';
export type { MapperFeature, MapperFeatureKind } from './lib/provide-mapper';
export type { MapperErrorCode, MapperErrorDetails } from './lib/errors';
export type {
  BackOf,
  FieldSpec,
  FrontOf,
  IgnoredField,
  MapperConfig,
  Mapping,
  MappingContext,
  MappingDirection,
  MappingOptions,
  MappingSpec,
  NamingConvention,
  NamingConventionName,
  RenamedField,
  TransformedField,
  Transformer,
  UndeclaredFieldPolicy,
} from './lib/types';
export {
  custom,
  enumMap,
  epochMillis,
  epochSeconds,
  isoDate,
  listOf,
  nested,
  numberString,
} from './lib/transformers';
export type { IsoDateOptions } from './lib/transformers';
export { VERSION } from './lib/version';
