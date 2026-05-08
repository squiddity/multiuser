// Provide a fallback SQLITE_URL so tests can import modules that
// transitively load src/config/env.ts.
process.env.SQLITE_URL ??= 'file::memory:?cache=shared';
