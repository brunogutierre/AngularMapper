import {
  HttpContext,
  HttpContextToken,
  HttpResponse,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Mapper, MapperError, type Mapping } from '@brunogutierre/angular-mapper';
import { map } from 'rxjs';

/**
 * Mappings applied by {@link mapperInterceptor} to a single request.
 *
 * @publicApi
 */
export interface HttpMappings {
  /** Converts the request body from frontend model(s) to DTO(s) before sending. */
  readonly request?: Mapping<unknown, unknown>;
  /** Converts the JSON response body from DTO(s) to frontend model(s). */
  readonly response?: Mapping<unknown, unknown>;
}

const HTTP_MAPPINGS = new HttpContextToken<HttpMappings | null>(() => null);

/**
 * Attaches mappings to a request so that {@link mapperInterceptor} converts its body and
 * response. Arrays are mapped element by element.
 *
 * Note that `HttpClient` cannot infer the response type from the context: keep passing the
 * frontend type as the generic, or prefer the `rxjs` operators for end-to-end inference.
 *
 * @param context Existing context to extend; a new one is created by default.
 *
 * @usageNotes
 * ```ts
 * this.http.post<User>('/api/users', user, {
 *   context: withMapping({ request: userMapping, response: userMapping }),
 * });
 * ```
 *
 * @publicApi
 */
export function withMapping(mappings: HttpMappings, context = new HttpContext()): HttpContext {
  return context.set(HTTP_MAPPINGS, mappings);
}

/**
 * Functional interceptor that applies the mappings attached with {@link withMapping}.
 * Requests without mappings pass through untouched. Error responses are not mapped.
 *
 * @usageNotes
 * ```ts
 * provideHttpClient(withInterceptors([mapperInterceptor]));
 * ```
 *
 * @publicApi
 */
export const mapperInterceptor: HttpInterceptorFn = (request, next) => {
  const mappings = request.context.get(HTTP_MAPPINGS);
  if (!mappings) return next(request);

  const mapper = inject(Mapper);
  const { request: requestMapping, response: responseMapping } = mappings;

  if (responseMapping && request.responseType !== 'json') {
    throw new MapperError(
      'MAPPER_INVALID_INPUT',
      `Response mappings need responseType 'json', got '${request.responseType}'.`,
      { mapping: responseMapping.name },
    );
  }

  const outgoing = requestMapping ? mapRequestBody(request, requestMapping, mapper) : request;
  return next(outgoing).pipe(
    map((event) => {
      if (!responseMapping || !(event instanceof HttpResponse) || event.body == null) return event;
      const body: unknown = event.body;
      return event.clone({
        body: Array.isArray(body)
          ? mapper.toFrontList(responseMapping, body)
          : mapper.toFront(responseMapping, body),
      });
    }),
  );
};

function mapRequestBody(
  request: HttpRequest<unknown>,
  mapping: Mapping<unknown, unknown>,
  mapper: Mapper,
): HttpRequest<unknown> {
  const body = request.body;
  if (body == null) return request;
  if (typeof body !== 'object' || isBinaryOrForm(body)) {
    throw new MapperError(
      'MAPPER_INVALID_INPUT',
      'Request mappings need an object or array body.',
      {
        mapping: mapping.name,
      },
    );
  }
  return request.clone({
    body: Array.isArray(body) ? mapper.toBackList(mapping, body) : mapper.toBack(mapping, body),
  });
}

function isBinaryOrForm(body: object): boolean {
  return (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  );
}
