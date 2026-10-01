# AngularMapper

[![CI](https://github.com/brunogutierre/AngularMapper/actions/workflows/ci.yml/badge.svg)](https://github.com/brunogutierre/AngularMapper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Type-safe, bidirectional mapping between frontend models and backend DTOs for Angular.

This repository holds `@brunogutierre/angular-mapper`, a library meant to feel like a native
Angular package, plus a demo app that uses it.

**Usage guide:** [projects/brunogutierre/angular-mapper/README.md](projects/brunogutierre/angular-mapper/README.md)

## Goal

Backends rarely speak the frontend's language. Typical gaps are `snake_case` keys, status codes,
timestamps as strings or numbers, decimals as strings, and nested DTOs. Apps usually bridge
them with hand-written conversion functions, one per entity and per direction. Those functions
drift apart, skip `null` checks, and break silently when the API changes.

AngularMapper replaces them with one explicit, typed **mapping table** per entity and an
application-wide **singleton `Mapper`** that applies it in both directions:

```ts
export const userMapping = defineMapping<UserDto, User>('user', {
  id: { from: 'user_id', only: 'toFront' },
  name: 'full_name',
  birthDate: { from: 'birth_date', transform: isoDate({ format: 'date' }) },
  status: { from: 'status_code', transform: enumMap({ A: 'active', I: 'inactive' }) },
});

bootstrapApplication(App, {
  providers: [provideMapper(withNamingConvention('snake_case'), withStrictMode())],
});

const user = inject(Mapper).toFront(userMapping, dto); // User, fully inferred
```

## Stack

| Area             | Choice                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| Framework        | Angular 22 (standalone, zoneless demo), TypeScript 6 in strict mode                   |
| Packaging        | ng-packagr with the Angular Package Format, partial compilation, `sideEffects: false` |
| Tests            | Vitest through `@angular/build:unit-test`, type tests with `tsc` and `expectTypeOf`   |
| Quality          | angular-eslint with typescript-eslint `strict-type-checked`, Prettier                 |
| Packaging checks | publint, `@arethetypeswrong/cli`, `npm pack --dry-run`                                |
| CI               | GitHub Actions on Node 24                                                             |

## Architecture

```text
projects/
├── brunogutierre/angular-mapper/      the library (@brunogutierre/angular-mapper)
│   ├── src/lib/
│   │   ├── types.ts                   public types: Mapping, Transformer, MappingSpec, ...
│   │   ├── define-mapping.ts          defineMapping(): validates and compiles a table once
│   │   ├── compiled-mapping.ts        private WeakMap from a Mapping to its compiled form
│   │   ├── engine.ts                  pure mapObject/mapList functions (no Angular)
│   │   ├── naming.ts                  built-in naming conventions (memoized)
│   │   ├── transformers.ts            isoDate, enumMap, nested, listOf, ...
│   │   ├── mapper.ts                  Mapper singleton + MAPPER_CONFIG token
│   │   └── provide-mapper.ts          provideMapper(withNamingConvention, withStrictMode)
│   ├── rxjs/                          secondary entry point: mapToFront, mapToBack, ...
│   └── http/                          secondary entry point: mapperInterceptor, withMapping
└── demo/                              demo app with a fake snake_case backend
```

The library has three layers:

- **Definition.** `defineMapping()` turns the typed table into an immutable `Mapping<B, F>`.
  It also builds a lookup structure, kept outside the public object.
- **Engine.** Pure functions apply a compiled mapping to a value in one direction. They have no
  Angular dependency, so most tests need no `TestBed`.
- **Angular integration.** The `Mapper` service, `provideMapper()` features, the RxJS operators
  and the interceptor are thin adapters over the engine.

## Design decisions

- **Pass the mapping object, not a string key.** We call `toFront(userMapping, dto)`, not
  `toFront('user', dto)`.
  - Types flow from the mapping, so the result is inferred with no global type registry.
  - A typo is a compile error.
  - Unused mappings are tree-shaken.
  - Lazy routes need no registration step.
- **A typed object table, not decorators.** It works with interfaces, which is how most Angular
  apps model DTOs. It needs no `reflect-metadata`, and every rule sits in one explicit place.
- **Transformers are bidirectional.** `toFront` and `toBack` live in one object, so the two
  directions cannot drift apart.
- **One policy for undeclared fields.** The policy is one of `keep`, `convert`, `drop` or
  `error`, instead of independent flags. Two flags such as "strict" and "convention" have
  ambiguous combinations; one policy plus "strict wins" is easy to explain.
- **`null` passes through and `undefined` is omitted.** Transformers never deal with nullish
  values, and partial `PATCH` payloads work with no special code.
- **A single `MapperError` with a `code` and `path`.** A hierarchy of error classes would add
  imports and add no information.
- **The `provideMapper(withX())` style, without `MapperModule`.** It mirrors `provideRouter` and
  `provideHttpClient`. NgModule apps can use it in their providers too, so a `forRoot()` module
  would only be a second API for the same thing.
- **Root-only configuration is enforced.** `Mapper` is a root singleton, so configuration in a
  lazy route would be silently ignored. An environment initializer detects this and throws.
- **Secondary entry points for `rxjs` and `http`.** This mirrors `@angular/core/rxjs-interop`
  and `@angular/common/http`. Apps that only need the core don't load the interceptor code.
- **No signal API.** Mapping is synchronous and pure, so it composes with `computed` and
  `httpResource({ parse })` as it is.
- **Defensive engine.**
  - Input is never mutated.
  - Output keys are defined with `defineProperty`, so a `__proto__` key from JSON cannot
    pollute prototypes.
  - Converted keys are memoized, with a bounded cache.
- **Workspace paths point to sources.** Tests, type tests and the demo need no prior build.
  ng-packagr still builds each entry point against the published name.

## Known limitations

- `HttpClient` generics cannot be inferred from an `HttpContext`. When you use the interceptor,
  write the response type yourself, or use the RxJS operators.
- Naming conventions are applied at runtime. Fields left to the convention are not
  type-checked, so declare important fields explicitly.
- Converting a key to camelCase and back is not always lossless. For example, `userID` becomes
  `user_id`, which reads back as `userId`.

## Getting started

Requirements: Node 24 and npm 11.

```bash
npm ci
npm start                  # demo app at http://localhost:4200
```

| Script                  | What it does                                       |
| ----------------------- | -------------------------------------------------- |
| `npm test`              | Library unit tests                                 |
| `npm run test:coverage` | Library tests with coverage thresholds (95%/90%)   |
| `npm run test:types`    | Type-level tests (`*.test-d.ts`)                   |
| `npm run test:demo`     | Demo integration tests                             |
| `npm run lint`          | ESLint for the library and the demo                |
| `npm run format:check`  | Prettier check                                     |
| `npm run build`         | Builds the library into `dist/`                    |
| `npm run check:package` | Build, then publint, attw and `npm pack --dry-run` |
| `npm run build:demo`    | Production build of the demo                       |

## The demo

The demo plays against an in-memory backend, implemented as an interceptor, that speaks
`snake_case` with status codes and epoch timestamps. It shows the three integration styles:

- `httpResource` with `parse` for the user list.
- The `mapToFront` operator for loading one user.
- `mapperInterceptor` with `withMapping` for `PATCH`. Only changed fields are sent.

A side panel shows the DTOs on the wire, next to the models used by the UI.

## License

[MIT](LICENSE)
