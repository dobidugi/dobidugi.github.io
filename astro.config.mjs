import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://dobidugi.github.io',
  markdown: {
    // 금액의 $ 표기는 유지하고 $$ 수식만 렌더링한다.
    remarkPlugins: [[remarkMath, { singleDollarTextMath: false }]],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'github-dark-default',
    },
  },
});
