import { cp } from 'node:fs/promises';
// Keep dev-mode search available after a build, on Windows and in CI.
await cp(new URL('../dist/pagefind/',import.meta.url),new URL('../public/pagefind/',import.meta.url),{recursive:true});
