/** Type-level tests for Mapper method inference. */
import { expectTypeOf } from 'vitest';
import { defineMapping } from './define-mapping';
import type { Mapper } from './mapper';

interface UserDto {
  user_id: number;
  full_name: string;
}
interface User {
  id: number;
  name: string;
}

declare const mapper: Mapper;
declare const dto: UserDto;
declare const user: User;
const userMapping = defineMapping<UserDto, User>('user', { id: 'user_id', name: 'full_name' });

expectTypeOf(mapper.toFront(userMapping, dto)).toEqualTypeOf<User>();
expectTypeOf(mapper.toBack(userMapping, user)).toEqualTypeOf<UserDto>();
expectTypeOf(mapper.toFrontList(userMapping, [dto])).toEqualTypeOf<User[]>();
expectTypeOf(mapper.toBackList(userMapping, [user])).toEqualTypeOf<UserDto[]>();
expectTypeOf(mapper.toBackPartial(userMapping, { name: 'Ada' })).toEqualTypeOf<Partial<UserDto>>();

// Readonly arrays are accepted.
mapper.toFrontList(userMapping, [dto] as readonly UserDto[]);

// @ts-expect-error a frontend model is not a DTO: the mapping, not the value, decides the type.
mapper.toFront(userMapping, user);

// @ts-expect-error a DTO is not a frontend model.
mapper.toBack(userMapping, dto);

// @ts-expect-error partial payloads still reject unknown fields.
mapper.toBackPartial(userMapping, { age: 3 });
