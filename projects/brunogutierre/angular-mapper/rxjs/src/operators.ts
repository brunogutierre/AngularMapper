import { assertInInjectionContext, inject, type Injector } from '@angular/core';
import { Mapper, type Mapping } from '@brunogutierre/angular-mapper';
import { map, type OperatorFunction } from 'rxjs';

/**
 * Options of the mapping operators.
 *
 * @publicApi
 */
export interface MapperOperatorOptions {
  /**
   * Injector used to resolve the {@link Mapper}. Required when the operator is created outside
   * an injection context, e.g. inside a method instead of a constructor or field initializer.
   */
  readonly injector?: Injector;
}

/**
 * Converts each emitted backend DTO into a frontend model.
 *
 * @usageNotes
 * ```ts
 * readonly user$ = this.http.get<UserDto>('/api/users/1').pipe(mapToFront(userMapping));
 * ```
 *
 * @publicApi
 */
export function mapToFront<B, F>(
  mapping: Mapping<B, F>,
  options?: MapperOperatorOptions,
): OperatorFunction<B, F> {
  const mapper = resolveMapper(mapToFront, options);
  return map((value) => mapper.toFront(mapping, value));
}

/**
 * Converts each emitted frontend model into a backend DTO.
 *
 * @publicApi
 */
export function mapToBack<B, F>(
  mapping: Mapping<B, F>,
  options?: MapperOperatorOptions,
): OperatorFunction<F, B> {
  const mapper = resolveMapper(mapToBack, options);
  return map((value) => mapper.toBack(mapping, value));
}

/**
 * Converts each emitted list of backend DTOs into frontend models.
 *
 * @publicApi
 */
export function mapToFrontList<B, F>(
  mapping: Mapping<B, F>,
  options?: MapperOperatorOptions,
): OperatorFunction<readonly B[], F[]> {
  const mapper = resolveMapper(mapToFrontList, options);
  return map((values) => mapper.toFrontList(mapping, values));
}

/**
 * Converts each emitted list of frontend models into backend DTOs.
 *
 * @publicApi
 */
export function mapToBackList<B, F>(
  mapping: Mapping<B, F>,
  options?: MapperOperatorOptions,
): OperatorFunction<readonly F[], B[]> {
  const mapper = resolveMapper(mapToBackList, options);
  return map((values) => mapper.toBackList(mapping, values));
}

/** Resolves the Mapper eagerly, like `toSignal()` and `takeUntilDestroyed()` do. */
function resolveMapper(
  operator: (...args: never[]) => unknown,
  options: MapperOperatorOptions | undefined,
): Mapper {
  if (options?.injector) return options.injector.get(Mapper);
  assertInInjectionContext(operator);
  return inject(Mapper);
}
