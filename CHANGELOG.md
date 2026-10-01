# Changelog

All notable changes to `@brunogutierre/angular-mapper` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-01

### Added

- `defineMapping()` with typed field specs: rename, `{ from, transform }`, `only` direction and
  `ignore()`.
- `Mapper` root singleton: `toFront`, `toBack`, `toFrontList`, `toBackList`, `toBackPartial`.
- `provideMapper()` with `withNamingConvention()` and `withStrictMode()`.
- Transformers: `isoDate`, `epochMillis`, `epochSeconds`, `numberString`, `enumMap`, `custom`,
  `nested`, `listOf`.
- Naming conventions: `snake_case`, `kebab-case`, `PascalCase`, `camelCase`, and custom ones.
- `@brunogutierre/angular-mapper/rxjs`: `mapToFront`, `mapToBack`, `mapToFrontList`,
  `mapToBackList`.
- `@brunogutierre/angular-mapper/http`: `mapperInterceptor` and `withMapping()`.
- `MapperError` with codes, mapping name, field path and cause.
- Compile-time check that both sides of a field agree on `null`.
- `isoDate({ format: 'date' })` reads and sends calendar dates in local time.

[0.1.0]: https://github.com/brunogutierre/AngularMapper/releases/tag/v0.1.0
