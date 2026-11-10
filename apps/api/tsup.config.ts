import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  noExternal: [/^@hos\//],
  external: ['pg', '@node-rs/argon2'],
});
