import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Mapper } from '@brunogutierre/angular-mapper';
import { withMapping } from '@brunogutierre/angular-mapper/http';
import { mapToFront } from '@brunogutierre/angular-mapper/rxjs';
import type { Observable } from 'rxjs';
import { userMapping } from './user.mappings';
import type { User, UserDto } from './user.models';

/** Shows the three ways of applying a mapping to HTTP traffic. */
@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);
  private readonly mapper = inject(Mapper);

  /** 1. Signals: httpResource parses the raw DTO list with the singleton Mapper. */
  readonly users = httpResource(() => '/api/users', {
    parse: (raw) => this.mapper.toFrontList(userMapping, raw as UserDto[]),
    defaultValue: [],
  });

  /** 2. RxJS operator: fully typed from the mapping. */
  private readonly toUser = mapToFront(userMapping);

  get(id: number): Observable<User> {
    return this.http.get<UserDto>(`/api/users/${String(id)}`).pipe(this.toUser);
  }

  /** 3. Interceptor: the PATCH body and the response are mapped by `mapperInterceptor`. */
  update(id: number, changes: Partial<User>): Observable<User> {
    return this.http.patch<User>(`/api/users/${String(id)}`, changes, {
      context: withMapping({ request: userMapping, response: userMapping }),
    });
  }
}
