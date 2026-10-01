import { Injectable, InjectionToken, inject } from '@angular/core';
import { DEFAULT_MAPPER_CONFIG } from './config';
import { mapList, mapObject } from './engine';
import type { MapperConfig, Mapping } from './types';

/**
 * Global configuration read by {@link Mapper}. Set it with `provideMapper()`; without it the
 * mapper keeps undeclared fields unchanged and uses no naming convention.
 *
 * @publicApi
 */
export const MAPPER_CONFIG = new InjectionToken<MapperConfig>('MAPPER_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_MAPPER_CONFIG,
});

/**
 * Application-wide singleton that converts data between backend DTOs and frontend models.
 *
 * Every method takes the mapping created with `defineMapping()` first; the mapping's types
 * drive inference of the input and output. Methods never mutate their input.
 *
 * @usageNotes
 * ```ts
 * export class UserService {
 *   private readonly http = inject(HttpClient);
 *   private readonly mapper = inject(Mapper);
 *
 *   save(user: User): Observable<User> {
 *     return this.http
 *       .post<UserDto>('/api/users', this.mapper.toBack(userMapping, user))
 *       .pipe(map((dto) => this.mapper.toFront(userMapping, dto)));
 *   }
 * }
 * ```
 *
 * @publicApi
 */
@Injectable({ providedIn: 'root' })
export class Mapper {
  /** Global configuration in effect, as resolved from `provideMapper()`. */
  readonly config: MapperConfig = inject(MAPPER_CONFIG);

  /**
   * Converts a backend DTO into a frontend model.
   *
   * @throws {MapperError} When the input is not an object, a transformer fails, or strict mode
   * meets an undeclared field.
   */
  toFront<B, F>(mapping: Mapping<B, F>, value: NoInfer<B>): F {
    return mapObject(mapping, value, 'toFront', this.config) as F;
  }

  /** Converts a frontend model into a backend DTO. */
  toBack<B, F>(mapping: Mapping<B, F>, value: NoInfer<F>): B {
    return mapObject(mapping, value, 'toBack', this.config) as B;
  }

  /** Converts a list of backend DTOs into frontend models. */
  toFrontList<B, F>(mapping: Mapping<B, F>, values: readonly NoInfer<B>[]): F[] {
    return mapList(mapping, values, 'toFront', this.config) as F[];
  }

  /** Converts a list of frontend models into backend DTOs. */
  toBackList<B, F>(mapping: Mapping<B, F>, values: readonly NoInfer<F>[]): B[] {
    return mapList(mapping, values, 'toBack', this.config) as B[];
  }

  /**
   * Converts a partial frontend model into a partial DTO, e.g. for `PATCH` requests: only the
   * fields present in `value` appear in the result.
   */
  toBackPartial<B, F>(mapping: Mapping<B, F>, value: Partial<NoInfer<F>>): Partial<B> {
    return mapObject(mapping, value, 'toBack', this.config) as Partial<B>;
  }
}
