import type { MapperConfig, NamingConvention } from './types';

/** Convention that leaves keys untouched (frontend and backend share names). */
export const IDENTITY_CONVENTION: NamingConvention = Object.freeze({
  toFront: (key: string) => key,
  toBack: (key: string) => key,
});

/** Configuration used when `provideMapper()` is not called or has no features. */
export const DEFAULT_MAPPER_CONFIG: MapperConfig = Object.freeze({
  undeclared: 'keep',
  convention: IDENTITY_CONVENTION,
});
