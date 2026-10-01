import {
  createEnvironmentInjector,
  EnvironmentInjector,
  NgModule,
  type EnvironmentProviders,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_MAPPER_CONFIG } from './config';
import { defineMapping } from './define-mapping';
import { MapperError } from './errors';
import { MAPPER_CONFIG, Mapper } from './mapper';
import { resolveNamingConvention } from './naming';
import { provideMapper, withNamingConvention, withStrictMode } from './provide-mapper';
import { isoDate } from './transformers';

interface UserDto {
  user_id: number;
  birth_date: string;
  nick_name?: string;
}

interface User {
  id: number;
  birthDate: Date;
  nickName?: string;
}

const userMapping = defineMapping<UserDto, User>('user', {
  id: 'user_id',
  birthDate: { from: 'birth_date', transform: isoDate({ format: 'date' }) },
});

const dto: UserDto = { user_id: 1, birth_date: '2000-01-31', nick_name: 'ada' };

function setup(...providers: EnvironmentProviders[]): Mapper {
  TestBed.configureTestingModule({ providers });
  return TestBed.inject(Mapper);
}

describe('Mapper', () => {
  describe('without provideMapper()', () => {
    it('is a root singleton using the default configuration', () => {
      const mapper = setup();

      expect(TestBed.inject(Mapper)).toBe(mapper);
      expect(mapper.config).toBe(DEFAULT_MAPPER_CONFIG);
    });

    it('converts objects in both directions, keeping undeclared fields', () => {
      const mapper = setup();
      const user = mapper.toFront(userMapping, dto);

      expect(user).toEqual({ id: 1, birthDate: new Date(Date.UTC(2000, 0, 31)), nick_name: 'ada' });
      expect(mapper.toBack(userMapping, user)).toEqual(dto);
    });

    it('converts lists in both directions', () => {
      const mapper = setup();
      const users = mapper.toFrontList(userMapping, [dto, { ...dto, user_id: 2 }]);

      expect(users.map((user) => user.id)).toEqual([1, 2]);
      expect(mapper.toBackList(userMapping, users)).toEqual([dto, { ...dto, user_id: 2 }]);
    });

    it('converts partial models for PATCH payloads', () => {
      expect(
        setup().toBackPartial(userMapping, { birthDate: new Date(Date.UTC(2001, 1, 2)) }),
      ).toEqual({
        birth_date: '2001-02-02',
      });
    });
  });

  describe('provideMapper()', () => {
    it('applies the naming convention to undeclared fields', () => {
      const mapper = setup(provideMapper(withNamingConvention('snake_case')));

      expect(mapper.config.undeclared).toBe('convert');
      expect(mapper.toFront(userMapping, dto).nickName).toBe('ada');
      expect(mapper.toBackPartial(userMapping, { nickName: 'grace' })).toEqual({
        nick_name: 'grace',
      });
    });

    it('throws on undeclared fields in strict mode', () => {
      const mapper = setup(provideMapper(withStrictMode()));

      expect(() => mapper.toFront(userMapping, dto)).toThrow(
        expect.objectContaining({ code: 'MAPPER_UNKNOWN_FIELD', path: 'nick_name' }),
      );
    });

    it('lets strict mode win over the naming convention in any order', () => {
      const snake = resolveNamingConvention('snake_case');
      for (const features of [
        [withStrictMode(), withNamingConvention('snake_case')],
        [withNamingConvention('snake_case'), withStrictMode()],
      ]) {
        TestBed.resetTestingModule();
        expect(setup(provideMapper(...features)).config).toEqual({
          undeclared: 'error',
          convention: snake,
        });
      }
    });

    it('lets a mapping opt out of strict mode', () => {
      const lenient = defineMapping<UserDto, User>(
        'lenient',
        { id: 'user_id' },
        { undeclared: 'convert' },
      );
      const mapper = setup(provideMapper(withNamingConvention('snake_case'), withStrictMode()));

      expect(mapper.toFront(lenient, dto)).toEqual({
        id: 1,
        birthDate: '2000-01-31',
        nickName: 'ada',
      });
    });

    it('exposes a frozen configuration through MAPPER_CONFIG', () => {
      setup(provideMapper(withStrictMode()));
      const config = TestBed.inject(MAPPER_CONFIG);

      expect(config).toBe(TestBed.inject(Mapper).config);
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('rejects the same feature twice', () => {
      expect(() => provideMapper(withStrictMode(), withStrictMode())).toThrow(
        'The StrictMode feature was passed to provideMapper() more than once.',
      );
    });

    it('rejects an unknown naming convention eagerly', () => {
      expect(() => withNamingConvention('snakecase' as 'snake_case')).toThrow(MapperError);
    });

    it('works from the providers of a root NgModule', () => {
      @NgModule({ providers: [provideMapper(withNamingConvention('snake_case'))] })
      class AppModule {}

      TestBed.configureTestingModule({ imports: [AppModule] });
      expect(TestBed.inject(Mapper).config.undeclared).toBe('convert');
    });

    it('rejects configuration registered in a child injector', () => {
      const root = TestBed.inject(EnvironmentInjector);

      expect(() => createEnvironmentInjector([provideMapper(withStrictMode())], root)).toThrow(
        expect.objectContaining({ code: 'MAPPER_ALREADY_PROVIDED' }),
      );
    });

    it('rejects being provided twice in the root providers', () => {
      expect(() => setup(provideMapper(), provideMapper(withStrictMode()))).toThrow(
        expect.objectContaining({ code: 'MAPPER_ALREADY_PROVIDED' }),
      );
    });
  });
});
