/** Type-level tests for the HTTP mapping context. */
import type { HttpContext } from '@angular/common/http';
import type { Mapping } from '@brunogutierre/angular-mapper';
import { expectTypeOf } from 'vitest';
import { withMapping } from './interceptor';

interface UserDto {
  user_id: number;
}
interface User {
  id: number;
}
declare const userMapping: Mapping<UserDto, User>;

expectTypeOf(
  withMapping({ request: userMapping, response: userMapping }),
).toEqualTypeOf<HttpContext>();
withMapping({ response: userMapping });
withMapping({});

// @ts-expect-error only mappings are accepted.
withMapping({ response: { name: 'fake' } });
