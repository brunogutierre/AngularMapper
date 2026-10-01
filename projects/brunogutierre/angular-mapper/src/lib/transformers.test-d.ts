/** Type-level tests for transformers composing inside defineMapping. */
import { expectTypeOf } from 'vitest';
import { defineMapping } from './define-mapping';
import {
  custom,
  enumMap,
  epochMillis,
  isoDate,
  listOf,
  nested,
  numberString,
} from './transformers';
import type { Transformer } from './types';

interface AddressDto {
  zip_code: string;
}
interface Address {
  zipCode: string;
}
interface OrderDto {
  placed_at: string;
  paid_at: number | null;
  total: string;
  status: 'N' | 'P';
  priority: 1 | 2;
  shipping: AddressDto;
  stops: AddressDto[];
  tags: string[];
}
interface Order {
  placedAt: Date;
  paidAt: Date | null;
  total: number;
  status: 'new' | 'paid';
  priority: 'low' | 'high';
  shipping: Address;
  stops: Address[];
  tags: Date[];
}

const addressMapping = defineMapping<AddressDto, Address>('address', { zipCode: 'zip_code' });

expectTypeOf(isoDate()).toEqualTypeOf<Transformer<string, Date>>();
expectTypeOf(numberString()).toEqualTypeOf<Transformer<string, number>>();
expectTypeOf(nested(addressMapping)).toEqualTypeOf<Transformer<AddressDto, Address>>();
expectTypeOf(listOf(nested(addressMapping))).toEqualTypeOf<Transformer<AddressDto[], Address[]>>();
expectTypeOf(enumMap({ N: 'new', P: 'paid' })).toEqualTypeOf<
  Transformer<'N' | 'P', 'new' | 'paid'>
>();
expectTypeOf(
  enumMap([
    [1, 'low'],
    [2, 'high'],
  ]),
).toEqualTypeOf<Transformer<1 | 2, 'low' | 'high'>>();
expectTypeOf(custom<number, string>({ toFront: String, toBack: Number })).toEqualTypeOf<
  Transformer<number, string>
>();

defineMapping<OrderDto, Order>('order', {
  placedAt: { from: 'placed_at', transform: isoDate() },
  paidAt: { from: 'paid_at', transform: epochMillis() },
  total: { from: 'total', transform: numberString() },
  status: { from: 'status', transform: enumMap({ N: 'new', P: 'paid' }) },
  priority: {
    from: 'priority',
    transform: enumMap([
      [1, 'low'],
      [2, 'high'],
    ]),
  },
  shipping: { from: 'shipping', transform: nested(addressMapping) },
  stops: { from: 'stops', transform: listOf(nested(addressMapping)) },
  tags: { from: 'tags', transform: listOf(isoDate()) },
});

defineMapping<OrderDto, Order>('wrong enum', {
  // @ts-expect-error 'cancelled' is not a frontend status.
  status: { from: 'status', transform: enumMap({ N: 'new', P: 'cancelled' }) },
});

defineMapping<OrderDto, Order>('wrong nested mapping', {
  // @ts-expect-error shipping is a single address, not a list.
  shipping: { from: 'shipping', transform: listOf(nested(addressMapping)) },
});
