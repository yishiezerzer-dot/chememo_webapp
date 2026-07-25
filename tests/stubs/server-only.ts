// Vitest runs under plain Node, not Next.js's bundler, so the real
// `server-only` package (which Next resolves internally) isn't installed.
// Aliased in vitest.config.ts so lib files with `import "server-only"` can
// still be unit-tested for their pure logic.
export {};
