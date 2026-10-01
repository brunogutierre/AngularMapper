import { HttpResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { delay, of } from 'rxjs';
import type { UserDto } from '../users/user.models';
import { TrafficLog } from './traffic-log';

const users: UserDto[] = [
  {
    user_id: 1,
    full_name: 'Maria Silva',
    email_address: 'maria@example.com',
    birth_date: '1990-04-12',
    status_code: 'A',
    created_at: Date.UTC(2024, 0, 15, 9, 30),
    address: { street_name: 'Avenida Paulista, 1000', zip_code: '01310-100', city: 'São Paulo' },
    last_login_ip: '10.0.0.7',
  },
  {
    user_id: 2,
    full_name: 'John Carter',
    email_address: 'john@example.com',
    birth_date: '1985-11-03',
    status_code: 'P',
    created_at: Date.UTC(2025, 5, 1, 14, 0),
    address: { street_name: '221B Baker Street', zip_code: 'NW1 6XE', city: 'London' },
  },
];

/**
 * In-memory REST API speaking snake_case JSON, standing in for a real backend. It must run
 * after `mapperInterceptor` so it sees the mapped DTOs.
 */
export const fakeBackendInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/users')) return next(request);

  const log = inject(TrafficLog);
  const { status, body } = handle(request);
  log.record({
    method: request.method,
    url: request.url,
    requestBody: request.body,
    responseBody: body,
  });
  return of(new HttpResponse({ status, body: structuredClone(body), url: request.url })).pipe(
    delay(250),
  );
};

function handle(request: HttpRequest<unknown>): { status: number; body: unknown } {
  const id = Number(request.url.split('/')[3]);
  const user = users.find((candidate) => candidate.user_id === id);

  if (request.method === 'GET' && Number.isNaN(id)) return { status: 200, body: users };
  if (!user) return { status: 404, body: { error_message: `User ${String(id)} not found.` } };
  if (request.method === 'GET') return { status: 200, body: user };
  if (request.method === 'PATCH') {
    Object.assign(user, request.body);
    return { status: 200, body: user };
  }
  return { status: 405, body: null };
}
