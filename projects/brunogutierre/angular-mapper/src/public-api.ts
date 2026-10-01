/*
 * Public API Surface of @brunogutierre/angular-mapper
 */

export { defineMapping, ignore } from './lib/define-mapping';
export { MapperError } from './lib/errors';
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
export { VERSION } from './lib/version';
