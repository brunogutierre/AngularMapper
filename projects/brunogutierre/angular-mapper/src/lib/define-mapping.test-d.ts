/**
 * Type-level tests, checked by `npm run test:types` (tsc --noEmit). They are never executed.
 * Each `@ts-expect-error` asserts that an invalid spec is rejected at compile time.
 */
import { expectTypeOf } from 'vitest';
import { defineMapping, ignore } from './define-mapping';
import type { BackOf, FrontOf, Mapping, Transformer } from './types';

interface UserDto {
  user_id: number;
  full_name: string;
  birth_date: string | null;
  created_at: string;
  nickname?: string;
}

interface User {
  id: number;
  name: string;
  birthDate: Date | null;
  createdAt: Date;
  nickname?: string;
  selected: boolean;
}

declare const isoDate: Transformer<string, Date>;
declare const numberString: Transformer<string, number>;

// A valid spec infers Mapping<UserDto, User>.
const userMapping = defineMapping<UserDto, User>('user', {
  id: 'user_id',
  name: 'full_name',
  birthDate: { from: 'birth_date', transform: isoDate },
  createdAt: { from: 'created_at', transform: isoDate, only: 'toFront' },
  nickname: 'nickname',
  selected: ignore(),
});
expectTypeOf(userMapping).toEqualTypeOf<Mapping<UserDto, User>>();
expectTypeOf<BackOf<typeof userMapping>>().toEqualTypeOf<UserDto>();
expectTypeOf<FrontOf<typeof userMapping>>().toEqualTypeOf<User>();

// Every field is optional: undeclared ones follow the undeclared-field policy.
defineMapping<UserDto, User>('partial', { id: 'user_id' });

// Both sides must agree on null, since the mapper copies null as-is.
defineMapping<{ name: string | null }, { name: string | null }>('nullable', { name: 'name' });

defineMapping<{ name: string | null }, { name: string }>('nullable backend', {
  // @ts-expect-error the backend may send null but the frontend field is not nullable.
  name: 'name',
});

defineMapping<{ name: string }, { name: string | null }>('nullable frontend', {
  // @ts-expect-error the frontend may hold null but the backend field is not nullable.
  name: 'name',
});

defineMapping<{ born: string | null }, { born: Date }>('nullable transformed', {
  // @ts-expect-error a transformer never sees null, so the frontend would receive it as-is.
  born: { from: 'born', transform: isoDate },
});

// Optional (undefined) fields are fine on either side: missing values are omitted.
defineMapping<{ nick?: string }, { nick: string }>('optional', { nick: 'nick' });

defineMapping<UserDto, User>('unknown backend key', {
  // @ts-expect-error 'userId' is not a key of UserDto.
  id: 'userId',
});

defineMapping<UserDto, User>('incompatible rename', {
  // @ts-expect-error full_name is a string, id is a number: a transformer is required.
  id: 'full_name',
});

defineMapping<UserDto, User>('unknown frontend key', {
  // @ts-expect-error 'age' is not a field of User.
  age: 'user_id',
});

defineMapping<UserDto, User>('wrong transformer output', {
  // @ts-expect-error numberString produces a number, birthDate is a Date.
  birthDate: { from: 'birth_date', transform: numberString },
});

defineMapping<UserDto, User>('wrong transformer input', {
  // @ts-expect-error isoDate reads a string, user_id is a number.
  createdAt: { from: 'user_id', transform: isoDate },
});

defineMapping<UserDto, User>('invalid direction', {
  // @ts-expect-error 'both' is not a mapping direction.
  id: { from: 'user_id', only: 'both' },
});
