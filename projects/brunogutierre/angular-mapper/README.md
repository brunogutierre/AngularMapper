# @brunogutierre/angular-mapper

Type-safe, bidirectional mapping between frontend models and backend DTOs for Angular.

Declare a mapping table once, inject the singleton `Mapper` anywhere, and convert data from the
backend to the frontend (`toFront`) and back (`toBack`) with full type inference.

```ts
const user = mapper.toFront(userMapping, dto); // User
const payload = mapper.toBack(userMapping, user); // UserDto
```

- **Type-safe tables.** Wrong keys, incompatible types and mismatched transformers are compile
  errors.
- **Bidirectional.** Each transformer defines both directions, so they cannot drift apart.
- **Angular-native.** Singleton service, `provideMapper(withX())` features, RxJS operators, a
  functional HTTP interceptor, and `httpResource` support.
- **Practical.** Naming conventions, strict mode, lists, partial `PATCH` payloads, nested
  objects, and errors that carry the exact field path.
- **Small and tree-shakable.** No runtime dependencies besides `tslib`.

## Installation

```bash
npm install @brunogutierre/angular-mapper
```

Requires Angular 22 or later and RxJS 7.4 or later.

## Quick start

### 1. Declare the mapping table

```ts
// user.mapping.ts
import { defineMapping, enumMap, ignore, isoDate, nested } from '@brunogutierre/angular-mapper';

interface UserDto {
  user_id: number;
  full_name: string;
  birth_date: string;
  status_code: 'A' | 'I';
  address: AddressDto;
}

interface User {
  id: number;
  name: string;
  birthDate: Date;
  status: 'active' | 'inactive';
  address: Address;
  selected: boolean;
}

export const userMapping = defineMapping<UserDto, User>('user', {
  id: { from: 'user_id', only: 'toFront' }, // read it, never send it back
  name: 'full_name', // plain rename: both sides are strings
  birthDate: { from: 'birth_date', transform: isoDate({ format: 'date' }) },
  status: { from: 'status_code', transform: enumMap({ A: 'active', I: 'inactive' }) },
  address: { from: 'address', transform: nested(addressMapping) },
  selected: ignore(), // UI-only state
});
```

The first type argument is the backend DTO and the second is the frontend model. The table is
keyed by frontend field. Every entry is optional; fields you leave out follow the
[undeclared-field policy](#undeclared-fields-naming-conventions-and-strict-mode).

### 2. Configure it once (optional)

```ts
// app.config.ts
import { provideMapper, withNamingConvention } from '@brunogutierre/angular-mapper';

export const appConfig: ApplicationConfig = {
  providers: [provideMapper(withNamingConvention('snake_case'))],
};
```

Without `provideMapper()`, the mapper works with defaults: undeclared fields are copied
unchanged.

### 3. Inject the Mapper anywhere

```ts
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly mapper = inject(Mapper);

  save(user: User): Observable<User> {
    return this.http
      .put<UserDto>(`/api/users/${user.id}`, this.mapper.toBack(userMapping, user))
      .pipe(map((dto) => this.mapper.toFront(userMapping, dto)));
  }
}
```

## The Mapper

`Mapper` is a root singleton. Each method takes the mapping first, and the mapping decides the
types.

| Method                            | Input          | Output       |
| --------------------------------- | -------------- | ------------ |
| `toFront(mapping, dto)`           | `B`            | `F`          |
| `toBack(mapping, model)`          | `F`            | `B`          |
| `toFrontList(mapping, dtos)`      | `readonly B[]` | `F[]`        |
| `toBackList(mapping, models)`     | `readonly F[]` | `B[]`        |
| `toBackPartial(mapping, changes)` | `Partial<F>`   | `Partial<B>` |

Rules applied by every method:

- The input is never mutated. The output is always a new plain object.
- `null` is copied as `null`, and transformers are not called for it.
- `undefined` values and missing keys are left out. This is what keeps `PATCH` payloads partial.
- Class instances are accepted as input, and declared fields are read through getters.
- A `__proto__` key in untrusted JSON becomes a normal property and never touches the
  prototype.

## Field specs

| Spec                                       | Meaning                                                 |
| ------------------------------------------ | ------------------------------------------------------- |
| `'backend_key'`                            | Rename. Both types must match, ignoring `null`.         |
| `{ from: 'backend_key', transform }`       | Convert the value with a transformer.                   |
| `{ from: 'backend_key', only: 'toFront' }` | Read only. Use it for ids and server timestamps.        |
| `{ from: 'backend_key', only: 'toBack' }`  | Send only. Use it for write-only fields like passwords. |
| `ignore()`                                 | Frontend-only field that is never sent.                 |

`defineMapping()` validates the table once and fails fast with `MAPPER_INVALID_MAPPING`. For
example, it rejects two fields that write the same backend key.

## Transformers

A `Transformer<B, F>` is an object with `toFront(value, context)` and `toBack(value, context)`.

| Transformer                          | Backend ↔ Frontend                                               |
| ------------------------------------ | ---------------------------------------------------------------- |
| `isoDate()`                          | ISO 8601 date-time ↔ `Date`, sent as a UTC timestamp             |
| `isoDate({ format: 'date' })`        | `YYYY-MM-DD` ↔ `Date` at local midnight, so the day never shifts |
| `epochMillis()` / `epochSeconds()`   | Unix time ↔ `Date`                                               |
| `numberString()`                     | `"12.50"` ↔ `12.5`, finite decimals sent as strings              |
| `enumMap({ A: 'active' })`           | String codes ↔ any value                                         |
| `enumMap([[1, 'low'], [2, 'high']])` | Numeric codes ↔ any value                                        |
| `nested(mapping)`                    | Applies another mapping to a nested object                       |
| `listOf(transformer)`                | Applies a transformer to each array element                      |
| `custom({ toFront, toBack })`        | Your own conversion                                              |

Transformers compose. For example, `listOf(nested(addressMapping))` maps a list of addresses,
and `listOf(isoDate())` maps a list of dates.

Date transformers only accept ISO 8601 strings. Values such as `"Oct 1"` are rejected instead
of being guessed.

`nested(mapping)` applies the nested mapping's own options over the global configuration. A
parent mapping's options are not inherited.

When a transformer throws, the error is wrapped in a `MapperError` that carries the full path,
such as `user › addresses[2].zipCode`.

## Undeclared fields, naming conventions and strict mode

Fields that are not in the table follow a policy:

| Policy           | Effect                                          | How to enable              |
| ---------------- | ----------------------------------------------- | -------------------------- |
| `keep` (default) | Copied unchanged                                | Nothing to do              |
| `convert`        | Keys renamed with the naming convention, deeply | `withNamingConvention(..)` |
| `error`          | Throws `MAPPER_UNKNOWN_FIELD`                   | `withStrictMode()`         |
| `drop`           | Left out                                        | Per mapping                |

```ts
provideMapper(withNamingConvention('snake_case'), withStrictMode());
```

- **Built-in conventions:** `snake_case`, `kebab-case`, `PascalCase` and `camelCase`. You can
  also pass a custom `{ toFront(key), toBack(key) }` object.
- **Acronyms and digits** are handled. For example, `userID` becomes `user_id` and
  `HTTPStatus` becomes `http_status`.
- **Strict mode wins** over the naming convention, in any order. It catches backend contract
  changes early.
- **One mapping can override** the global settings. A convention on its own implies `convert`,
  unless the app is in strict mode:
  `defineMapping(name, spec, { convention: 'PascalCase' })`. Use `{ undeclared: 'drop' }` to
  leave undeclared fields out of one mapping.
- **`ignore()` fields stay frontend-only.** They are never sent, and never filled from a
  backend field of the same name.

`provideMapper()` belongs in the root providers. Calling it in a lazy route or a child injector
throws `MAPPER_ALREADY_PROVIDED`, because the root singleton would otherwise ignore that
configuration silently.

## RxJS operators

Import them from `@brunogutierre/angular-mapper/rxjs`:

```ts
readonly user$ = this.http.get<UserDto>('/api/users/1').pipe(mapToFront(userMapping));
readonly users$ = this.http.get<UserDto[]>('/api/users').pipe(mapToFrontList(userMapping));
```

`mapToFront`, `mapToBack`, `mapToFrontList` and `mapToBackList` resolve the `Mapper` when they
are created. Like `toSignal()`, they must be created in an injection context. Outside one, pass
`{ injector }` as the second argument.

## HTTP interceptor

Import it from `@brunogutierre/angular-mapper/http`:

```ts
provideHttpClient(withInterceptors([mapperInterceptor]));

this.http.patch<User>(`/api/users/${id}`, changes, {
  context: withMapping({ request: userMapping, response: userMapping }),
});
```

- Object and array bodies are mapped with `toBack`. JSON responses are mapped with `toFront`.
- Requests without `withMapping` pass through untouched, and so do error responses.
- Binary or form bodies, and non-JSON response types, throw `MAPPER_INVALID_INPUT`. Nothing is
  silently emptied.
- **Typing limit:** `HttpClient` cannot infer the response type from the context, so keep
  writing the generic (`patch<User>`). Use the operators for end-to-end inference.

## Signals and `httpResource`

```ts
private readonly mapper = inject(Mapper);

readonly users = httpResource(() => '/api/users', {
  parse: (raw) => this.mapper.toFrontList(userMapping, raw as UserDto[]),
  defaultValue: [],
});
```

## NgModule applications

Call `provideMapper()` in the root module's providers:

```ts
@NgModule({ providers: [provideMapper(withNamingConvention('snake_case'))] })
export class AppModule {}
```

## Errors

Every error is a `MapperError` with these properties:

- `code`: one of `MAPPER_INVALID_MAPPING`, `MAPPER_INVALID_CONFIG`, `MAPPER_INVALID_INPUT`,
  `MAPPER_UNKNOWN_FIELD`, `MAPPER_TRANSFORM_FAILED` or `MAPPER_ALREADY_PROVIDED`.
- `mapping`: the name of the mapping that failed.
- `path`: the location of the field, such as `addresses[1].zipCode`.
- `cause`: the original error.

## Type helpers

`BackOf<typeof userMapping>` and `FrontOf<typeof userMapping>` extract the two types of a
mapping.

## License

MIT
