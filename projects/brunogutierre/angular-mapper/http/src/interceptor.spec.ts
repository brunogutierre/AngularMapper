import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  defineMapping,
  provideMapper,
  withNamingConvention,
  type MapperError,
} from '@brunogutierre/angular-mapper';
import { firstValueFrom } from 'rxjs';
import { mapperInterceptor, withMapping } from './interceptor';

interface UserDto {
  user_id: number;
  full_name: string;
}
interface User {
  id: number;
  name: string;
}

const userMapping = defineMapping<UserDto, User>('user', { id: 'user_id', name: 'full_name' });
const dto: UserDto = { user_id: 1, full_name: 'Ada' };
const user: User = { id: 1, name: 'Ada' };

describe('mapperInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideMapper(withNamingConvention('snake_case')),
        provideHttpClient(withInterceptors([mapperInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
  });

  it('maps the response body to the frontend model', async () => {
    const response = firstValueFrom(
      http.get<User>('/users/1', { context: withMapping({ response: userMapping }) }),
    );
    backend.expectOne('/users/1').flush({ ...dto, created_at: 'x' });

    expect(await response).toEqual({ ...user, createdAt: 'x' });
  });

  it('maps array responses element by element', async () => {
    const response = firstValueFrom(
      http.get<User[]>('/users', { context: withMapping({ response: userMapping }) }),
    );
    backend.expectOne('/users').flush([dto, { ...dto, user_id: 2 }]);

    expect(await response).toEqual([user, { ...user, id: 2 }]);
  });

  it('maps the request body to the DTO and leaves the original request untouched', async () => {
    const response = firstValueFrom(
      http.post<User>('/users', user, {
        context: withMapping({ request: userMapping, response: userMapping }),
      }),
    );
    const request = backend.expectOne('/users');

    expect(request.request.body).toEqual(dto);
    request.flush(dto);
    expect(await response).toEqual(user);
  });

  it('maps array request bodies and partial PATCH bodies', () => {
    http.put('/users', [user], { context: withMapping({ request: userMapping }) }).subscribe();
    http
      .patch('/users/1', { name: 'Grace' }, { context: withMapping({ request: userMapping }) })
      .subscribe();

    expect(backend.expectOne('/users').request.body).toEqual([dto]);
    expect(backend.expectOne('/users/1').request.body).toEqual({ full_name: 'Grace' });
  });

  it('passes requests without mappings through untouched', async () => {
    const response = firstValueFrom(http.post('/raw', user));
    const request = backend.expectOne('/raw');

    expect(request.request.body).toBe(user);
    request.flush(dto);
    expect(await response).toEqual(dto);
  });

  it('skips empty bodies', async () => {
    const response = firstValueFrom(
      http.delete('/users/1', {
        context: withMapping({ request: userMapping, response: userMapping }),
      }),
    );
    const request = backend.expectOne('/users/1');

    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(await response).toBeNull();
  });

  it('does not map error responses', async () => {
    const response = firstValueFrom(
      http.get('/users/1', { context: withMapping({ response: userMapping }) }),
    );
    backend
      .expectOne('/users/1')
      .flush({ error_code: 'E1' }, { status: 404, statusText: 'Not Found' });

    await expect(response).rejects.toMatchObject({ status: 404, error: { error_code: 'E1' } });
  });

  it('extends an existing HttpContext', () => {
    const context = new HttpContext();
    expect(withMapping({ response: userMapping }, context)).toBe(context);
  });

  it.each([
    ['a FormData body', () => new FormData()],
    ['a Blob body', () => new Blob(['x'])],
    ['a string body', () => 'text'],
  ])('rejects %s for request mappings', async (_, body) => {
    const response = firstValueFrom(
      http.post('/upload', body(), { context: withMapping({ request: userMapping }) }),
    );

    await expect(response).rejects.toMatchObject({
      code: 'MAPPER_INVALID_INPUT',
      mapping: 'user',
    } satisfies Partial<MapperError>);
    backend.expectNone('/upload');
  });

  it('rejects response mappings on non-JSON requests', async () => {
    const response = firstValueFrom(
      http.get('/file', { responseType: 'text', context: withMapping({ response: userMapping }) }),
    );

    await expect(response).rejects.toMatchObject({ code: 'MAPPER_INVALID_INPUT' });
    backend.expectNone('/file');
  });

  it('surfaces mapping errors from the response', async () => {
    const response = firstValueFrom(
      http.get('/users/1', { context: withMapping({ response: userMapping }) }),
    );
    backend.expectOne('/users/1').flush('not json', { headers: { 'content-type': 'text/plain' } });

    await expect(response).rejects.toMatchObject({ code: 'MAPPER_INVALID_INPUT' });
  });
});
