// Provide a fallback DATABASE_URL so tests can import modules that
// transitively load src/config/env.ts. Use the same default as docs/.env so
// integration tests work out-of-the-box after starting docker postgres.
// The ??= means explicit env vars from CI/shell still win.
process.env.DATABASE_URL ??= 'postgres://multiuser:multiuser@localhost:5432/multiuser';
