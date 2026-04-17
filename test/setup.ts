// Provide a fallback DATABASE_URL so unit tests can import modules that
// transitively load src/config/env.ts without a real database present.
// The ??= means this only applies when the variable is not already set —
// integration tests and CI jobs that supply a real DATABASE_URL are unaffected.
process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';
