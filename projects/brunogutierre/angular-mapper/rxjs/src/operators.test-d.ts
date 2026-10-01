/** Type-level tests for the mapping operators. */
import type { Mapping } from '@brunogutierre/angular-mapper';
import type { Observable } from 'rxjs';
import { expectTypeOf } from 'vitest';
import { mapToBack, mapToFront, mapToFrontList, type mapToBackList } from './operators';

interface UserDto {
  user_id: number;
}
interface User {
  id: number;
}

declare const userMapping: Mapping<UserDto, User>;
declare const dto$: Observable<UserDto>;
declare const dtos$: Observable<UserDto[]>;
declare const user$: Observable<User>;
declare const untyped$: Observable<object>;

expectTypeOf(dto$.pipe(mapToFront(userMapping))).toEqualTypeOf<Observable<User>>();
expectTypeOf(user$.pipe(mapToBack(userMapping))).toEqualTypeOf<Observable<UserDto>>();
expectTypeOf(dtos$.pipe(mapToFrontList(userMapping))).toEqualTypeOf<Observable<User[]>>();
expectTypeOf(dto$.pipe(mapToFront(userMapping), mapToBack(userMapping))).toEqualTypeOf<
  Observable<UserDto>
>();
expectTypeOf<ReturnType<typeof mapToBackList<UserDto, User>>>().returns.toEqualTypeOf<
  Observable<UserDto[]>
>();

// @ts-expect-error the source must emit the mapping's backend type.
untyped$.pipe(mapToFront(userMapping));
