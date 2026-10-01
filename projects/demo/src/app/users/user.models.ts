/** Shapes sent by the (fake) backend: snake_case, codes and timestamps. */
export interface AddressDto {
  street_name: string;
  zip_code: string;
  city: string;
}

export interface UserDto {
  user_id: number;
  full_name: string;
  email_address: string;
  birth_date: string;
  status_code: 'A' | 'I' | 'P';
  created_at: number;
  address: AddressDto;
  /** Not declared in the mapping: renamed by the global snake_case convention. */
  last_login_ip?: string;
}

/** Shapes used by the UI: camelCase, Dates and readable enums. */
export interface Address {
  street: string;
  zipCode: string;
  city: string;
}

export type UserStatus = 'active' | 'inactive' | 'pending';

export interface User {
  id: number;
  name: string;
  email: string;
  birthDate: Date;
  status: UserStatus;
  createdAt: Date;
  address: Address;
  lastLoginIp?: string;
}
