import {
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import { DEFAULT_MAPPER_CONFIG } from './config';
import { MapperError } from './errors';
import { MAPPER_CONFIG, Mapper } from './mapper';
import { resolveNamingConvention } from './naming';
import type { MapperConfig, NamingConvention, NamingConventionName } from './types';

/**
 * Identifies a {@link MapperFeature}.
 *
 * @publicApi
 */
export type MapperFeatureKind = 'NamingConvention' | 'StrictMode';

/**
 * A configuration feature for `provideMapper()`, created by a `with*` function.
 *
 * @publicApi
 */
export interface MapperFeature<K extends MapperFeatureKind = MapperFeatureKind> {
  readonly kind: K;
  /** @internal Applies the feature to the configuration being built. Not part of the public API. */
  readonly ɵconfigure: (config: MapperConfig) => MapperConfig;
}

/**
 * Renames undeclared fields with the backend naming convention, deeply. Frontend keys are
 * assumed to be camelCase.
 *
 * @usageNotes
 * ```ts
 * provideMapper(withNamingConvention('snake_case'));
 * ```
 *
 * @publicApi
 */
export function withNamingConvention(
  convention: NamingConventionName | NamingConvention,
): MapperFeature<'NamingConvention'> {
  let resolved: NamingConvention;
  try {
    resolved = resolveNamingConvention(convention);
  } catch (error) {
    throw new MapperError('MAPPER_INVALID_CONFIG', (error as Error).message, { cause: error });
  }
  return {
    kind: 'NamingConvention',
    ɵconfigure: (config) => ({
      convention: resolved,
      undeclared: config.undeclared === 'error' ? 'error' : 'convert',
    }),
  };
}

/**
 * Makes every mapping throw `MAPPER_UNKNOWN_FIELD` on undeclared fields, catching backend
 * contract changes early. Takes precedence over {@link withNamingConvention}; a single mapping
 * can still opt out with `{ undeclared: 'keep' }`.
 *
 * @publicApi
 */
export function withStrictMode(): MapperFeature<'StrictMode'> {
  return { kind: 'StrictMode', ɵconfigure: (config) => ({ ...config, undeclared: 'error' }) };
}

/**
 * Configures the application-wide {@link Mapper}. Call it once, in the root providers
 * (`bootstrapApplication` or the root `NgModule`). The mapper works without it, using
 * defaults.
 *
 * @usageNotes
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideMapper(withNamingConvention('snake_case'), withStrictMode())],
 * });
 * ```
 *
 * @throws {MapperError} `MAPPER_INVALID_CONFIG` when a feature is passed twice, and
 * `MAPPER_ALREADY_PROVIDED` when the providers are registered below the root injector (e.g. in a
 * lazy route) or more than once.
 *
 * @publicApi
 */
export function provideMapper(...features: MapperFeature[]): EnvironmentProviders {
  const config = buildConfig(features);
  return makeEnvironmentProviders([
    { provide: MAPPER_CONFIG, useValue: config },
    provideEnvironmentInitializer(() => {
      // Mapper is a root singleton: if it does not see this config, these providers were
      // registered in a child injector and would be silently ignored.
      if (inject(Mapper).config !== config) {
        throw new MapperError(
          'MAPPER_ALREADY_PROVIDED',
          'provideMapper() must be called once, in the root providers. ' +
            'Mapper is a root singleton, so configuration in lazy routes or child injectors is ignored.',
        );
      }
    }),
  ]);
}

function buildConfig(features: readonly MapperFeature[]): MapperConfig {
  const kinds = new Set<MapperFeatureKind>();
  for (const feature of features) {
    if (kinds.has(feature.kind)) {
      throw new MapperError(
        'MAPPER_INVALID_CONFIG',
        `The ${feature.kind} feature was passed to provideMapper() more than once.`,
      );
    }
    kinds.add(feature.kind);
  }
  // Strict mode runs last so it wins regardless of argument order.
  const ordered = [...features].sort(
    (a, b) => Number(a.kind === 'StrictMode') - Number(b.kind === 'StrictMode'),
  );
  return Object.freeze(
    ordered.reduce((config, feature) => feature.ɵconfigure(config), DEFAULT_MAPPER_CONFIG),
  );
}
