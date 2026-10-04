/**
 * Stands in for the `server-only` boundary marker, which throws unless the
 * runtime advertises the `react-server` condition. Both the Vite SSR build and
 * Vitest alias the real package to this module, so a stray import in the
 * browser bundle still fails the build while Node and the test runner can
 * execute the domain modules directly.
 */
export {};
