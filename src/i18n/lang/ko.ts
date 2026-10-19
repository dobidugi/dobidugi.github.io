import type { UIStrings } from '../types';
export default {
  nav:{home:'홈',posts:'게시물',tags:'태그',about:'소개',archives:'아카이브',search:'검색'},
  post:{publishedAt:'작성일',updatedAt:'수정',sharePostIntro:'공유하기',sharePostOn:'{{platform}}에 공유',sharePostViaEmail:'이메일로 공유',tagLabel:'태그',backToTop:'맨 위로',goBack:'목록으로',editPage:'수정하기',previousPost:'이전 글',nextPost:'다음 글'},
  pagination:{prev:'이전',next:'다음',page:'페이지'},
  home:{socialLinks:'다른 곳에서',featured:'추천 글',recentPosts:'최근 글',allPosts:'전체 게시물'},
  footer:{copyright:'Copyright',allRightsReserved:'dobidugi'},
  pages:{tagTitle:'태그',tagDesc:'이 태그의 글 모음',tagsTitle:'태그',tagsDesc:'글에 사용된 태그입니다.',postsTitle:'게시물',postsDesc:'배우고 이해한 것을 기록합니다.',archivesTitle:'아카이브',archivesDesc:'연도별 글 모음',searchTitle:'검색',searchDesc:'제목과 본문에서 찾아보세요.'},
  a11y:{skipToContent:'본문으로 바로가기',openMenu:'메뉴 열기',closeMenu:'메뉴 닫기',toggleTheme:'화면 테마 전환',searchPlaceholder:'게시물 검색',noResults:'검색 결과가 없습니다.',goToPreviousPage:'이전 페이지로',goToNextPage:'다음 페이지로'},
  notFound:{title:'404',message:'페이지를 찾을 수 없습니다.',goHome:'홈으로 돌아가기'},
} satisfies UIStrings;
