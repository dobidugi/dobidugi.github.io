import { defineAstroPaperConfig } from './src/types/config';
export default defineAstroPaperConfig({
  site: { url: 'https://dobidugi.github.io/', title: 'dobidugi', description: '개발하면서 마주친 문제와 인프라 운영 중 겪은 시행착오를 기록합니다. 기술 문서와 강의에서 배운 내용도 함께 정리해, 필요할 때 다시 찾아볼 수 있는 개발 노트로 남깁니다.', author: 'dobidugi', profile: 'https://github.com/dobidugi', ogImage: 'og.png', lang: 'ko', timezone: 'Asia/Seoul', dir: 'ltr' },
  posts: { perPage: 12, perIndex: 44, scheduledPostMargin: 0 },
  features: { lightAndDarkMode: true, dynamicOgImage: false, showArchives: false, showBackButton: true, editPost: { enabled: false }, search: 'pagefind' },
  socials: [{ name: 'github', url: 'https://github.com/dobidugi' }],
  shareLinks: [],
});
