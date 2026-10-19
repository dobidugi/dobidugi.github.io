import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { transformerNotationDiff, transformerNotationHighlight } from '@shikijs/transformers';
import { transformerFileName } from './src/utils/transformers/fileName';
import config from './astro-paper.config';

export default defineConfig({
  site: config.site.url,
  trailingSlash: 'always',
  integrations: [sitemap({filter: page => !page.includes('/404') && !page.includes('/search/') && !page.includes('/archives/')})],
  i18n: {locales:['ko'],defaultLocale:'ko',routing:{prefixDefaultLocale:false}},
  markdown: {
    processor: unified({remarkPlugins: [[remarkMath, {singleDollarTextMath:false}]], rehypePlugins:[rehypeKatex]}),
    shikiConfig: {themes:{light:'min-light',dark:'night-owl'},defaultColor:false,wrap:false,langAlias:{gradle:'groovy'},transformers:[transformerFileName({style:'v2',hideDot:false}),transformerNotationHighlight(),transformerNotationDiff({matchAlgorithm:'v3'})]},
  },
  vite: {plugins:[tailwindcss()]},
  env: {schema:{PUBLIC_GOOGLE_SITE_VERIFICATION:envField.string({access:'public',context:'client',optional:true})}},
});
