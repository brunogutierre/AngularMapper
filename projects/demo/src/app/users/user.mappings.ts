import {
  defineMapping,
  enumMap,
  epochMillis,
  isoDate,
  nested,
} from '@brunogutierre/angular-mapper';
import type { Address, AddressDto, User, UserDto } from './user.models';

export const addressMapping = defineMapping<AddressDto, Address>('address', {
  street: 'street_name',
  // zipCode and city follow the global snake_case convention: no need to declare them.
});

export const userMapping = defineMapping<UserDto, User>('user', {
  id: { from: 'user_id', only: 'toFront' },
  name: 'full_name',
  email: 'email_address',
  birthDate: { from: 'birth_date', transform: isoDate({ format: 'date' }) },
  status: {
    from: 'status_code',
    transform: enumMap({ A: 'active', I: 'inactive', P: 'pending' }),
  },
  createdAt: { from: 'created_at', transform: epochMillis(), only: 'toFront' },
  address: { from: 'address', transform: nested(addressMapping) },
});
