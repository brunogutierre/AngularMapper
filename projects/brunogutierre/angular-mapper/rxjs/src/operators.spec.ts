import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defineMapping, provideMapper, withStrictMode } from '@brunogutierre/angular-mapper';
import { firstValueFrom, of, toArray } from 'rxjs';
import { mapToBack, mapToBackList, mapToFront, mapToFrontList } from './operators';

interface UserDto {
  user_id: number;
}
interface User {
  id: number;
}

const userMapping = defineMapping<UserDto, User>('user', { id: 'user_id' });

describe('mapping operators', () => {
  const inContext = <T>(fn: () => T): T => TestBed.runInInjectionContext(fn);

  it('mapToFront converts every emission', async () => {
    const users = of({ user_id: 1 }, { user_id: 2 }).pipe(
      inContext(() => mapToFront(userMapping)),
      toArray(),
    );

    expect(await firstValueFrom(users)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('mapToBack converts every emission', async () => {
    const dto = of({ id: 1 }).pipe(inContext(() => mapToBack(userMapping)));
    expect(await firstValueFrom(dto)).toEqual({ user_id: 1 });
  });

  it('list operators convert emitted arrays', async () => {
    const users = of([{ user_id: 1 }]).pipe(inContext(() => mapToFrontList(userMapping)));
    const dtos = of([{ id: 2 }]).pipe(inContext(() => mapToBackList(userMapping)));

    expect(await firstValueFrom(users)).toEqual([{ id: 1 }]);
    expect(await firstValueFrom(dtos)).toEqual([{ user_id: 2 }]);
  });

  it('use the configured singleton Mapper', async () => {
    TestBed.configureTestingModule({ providers: [provideMapper(withStrictMode())] });
    const users = of({ user_id: 1, extra: true }).pipe(inContext(() => mapToFront(userMapping)));

    await expect(firstValueFrom(users)).rejects.toMatchObject({ code: 'MAPPER_UNKNOWN_FIELD' });
  });

  it('accept an explicit injector outside an injection context', async () => {
    const injector = TestBed.inject(Injector);
    const users = of({ user_id: 3 }).pipe(mapToFront(userMapping, { injector }));

    expect(await firstValueFrom(users)).toEqual({ id: 3 });
  });

  it.each([
    ['mapToFront', () => mapToFront(userMapping)],
    ['mapToBack', () => mapToBack(userMapping)],
    ['mapToFrontList', () => mapToFrontList(userMapping)],
    ['mapToBackList', () => mapToBackList(userMapping)],
  ])('%s throws outside an injection context without an injector', (name, create) => {
    expect(create).toThrow(name);
  });

  it('resolve the Mapper when the operator is created, not when subscribed', () => {
    const injector = TestBed.inject(Injector);
    const operator = runInInjectionContext(injector, () => mapToFront(userMapping));

    // Subscribing later, outside any injection context, still works.
    let result: User | undefined;
    of({ user_id: 5 })
      .pipe(operator)
      .subscribe((user) => (result = user));
    expect(result).toEqual({ id: 5 });
  });
});
