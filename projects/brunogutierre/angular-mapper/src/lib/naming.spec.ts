import { DEFAULT_MAPPER_CONFIG, IDENTITY_CONVENTION } from './config';
import { defineMapping } from './define-mapping';
import { mapObject } from './engine';
import { MapperError } from './errors';
import { resolveNamingConvention } from './naming';
import type { MappingOptions, NamingConvention, NamingConventionName } from './types';

describe('resolveNamingConvention', () => {
  const snake = resolveNamingConvention('snake_case');
  const kebab = resolveNamingConvention('kebab-case');
  const pascal = resolveNamingConvention('PascalCase');

  it.each([
    ['userId', 'user_id'],
    ['id', 'id'],
    ['userID', 'user_id'],
    ['HTTPStatus', 'http_status'],
    ['parseHTTPResponse', 'parse_http_response'],
    ['address2', 'address2'],
    ['line2Text', 'line2_text'],
    ['_internalId', '_internal_id'],
  ])('snake_case sends %s as %s', (front, back) => {
    expect(snake.toBack(front)).toBe(back);
  });

  it.each([
    ['user_id', 'userId'],
    ['id', 'id'],
    ['http_status', 'httpStatus'],
    ['line2_text', 'line2Text'],
    ['address_2', 'address2'],
    ['_id', '_id'],
    ['__typename', '__typename'],
    ['double__underscore', 'doubleUnderscore'],
  ])('snake_case reads %s as %s', (back, front) => {
    expect(snake.toFront(back)).toBe(front);
  });

  it('kebab-case uses dashes', () => {
    expect(kebab.toBack('createdAt')).toBe('created-at');
    expect(kebab.toFront('created-at')).toBe('createdAt');
  });

  it.each([
    ['UserId', 'userId'],
    ['Id', 'id'],
    ['ID', 'id'],
    ['HTTPStatus', 'httpStatus'],
    ['SKU2', 'sku2'],
    ['', ''],
  ])('PascalCase reads %s as %s', (back, front) => {
    expect(pascal.toFront(back)).toBe(front);
  });

  it('PascalCase capitalizes when sending', () => {
    expect(pascal.toBack('userId')).toBe('UserId');
  });

  it('camelCase leaves keys untouched', () => {
    expect(resolveNamingConvention('camelCase')).toBe(IDENTITY_CONVENTION);
  });

  it('returns custom conventions unchanged', () => {
    const custom: NamingConvention = { toFront: (key) => key, toBack: (key) => key };
    expect(resolveNamingConvention(custom)).toBe(custom);
  });

  it('returns the same instance for a built-in name', () => {
    expect(resolveNamingConvention('snake_case')).toBe(snake);
  });

  it('keeps results stable once the memo cache is full', () => {
    for (let index = 0; index < 2_100; index++) snake.toBack(`fieldNumber${String(index)}`);
    expect(snake.toBack('userId')).toBe('user_id');
  });

  it('rejects unknown names and malformed objects', () => {
    expect(() => resolveNamingConvention('SCREAMING' as NamingConventionName)).toThrow(
      'Unknown naming convention "SCREAMING"',
    );
    expect(() =>
      resolveNamingConvention({ toFront: String } as unknown as NamingConvention),
    ).toThrow(MapperError);
    expect(() => resolveNamingConvention('toString' as NamingConventionName)).toThrow(MapperError);
  });
});

describe('defineMapping option validation', () => {
  const define = (options: MappingOptions) => () => defineMapping<object, object>('m', {}, options);

  it('accepts built-in and custom conventions', () => {
    expect(define({ convention: 'snake_case', undeclared: 'convert' })).not.toThrow();
    expect(define({ convention: IDENTITY_CONVENTION })).not.toThrow();
  });

  it('rejects an unknown convention with the mapping name', () => {
    expect(define({ convention: 'snake' as NamingConventionName })).toThrow(
      expect.objectContaining({ code: 'MAPPER_INVALID_MAPPING', mapping: 'm' }),
    );
  });

  it('rejects an unknown undeclared-field policy', () => {
    expect(define({ undeclared: 'ignore' as MappingOptions['undeclared'] })).toThrow(
      '"undeclared" must be one of keep, convert, drop, error.',
    );
  });
});

describe('conventions applied by the engine', () => {
  it('convert undeclared keys deeply with a per-mapping convention name', () => {
    const mapping = defineMapping<object, object>(
      'm',
      {},
      { convention: 'snake_case', undeclared: 'convert' },
    );
    const input = { first_name: 'Ada', home_address: { zip_code: '1' } };
    const front = mapObject(mapping, input, 'toFront', DEFAULT_MAPPER_CONFIG);

    expect(front).toEqual({ firstName: 'Ada', homeAddress: { zipCode: '1' } });
    expect(mapObject(mapping, front, 'toBack', DEFAULT_MAPPER_CONFIG)).toEqual(input);
  });
});
