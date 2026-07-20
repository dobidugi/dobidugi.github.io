import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dobidugi.github.io',
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
    },
  },
});
