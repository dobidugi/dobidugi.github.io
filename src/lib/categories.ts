type CategoryData = { category: string; categories?: string[] };
export type Category = {id:string;label:string;count:number};
export function getPostCategories(data:CategoryData):string[] { return [...new Set([data.category,...(data.categories??[])].map(category=>category.trim()).filter(Boolean))]; }
const labels:Record<string,string>={SECURITY:'보안',ARCHITECTURE:'아키텍처',JOURNAL:'회고',LECTURE:'강의',FE:'프론트엔드',REVIEW:'리뷰',Dicom:'DICOM',MATH:'수학',INFRA:'인프라',RN:'React Native',YOUTUBE:'영상',KOTLIN:'Kotlin',CS:'CS','penetration-testing':'모의해킹',SPRING:'Spring'};
export function getCategoryLabel(category:string):string { return labels[category]??category; }
export function getCategorySlug(category:string):string { return encodeURIComponent(category.toLowerCase()); }
export function getCategoryUrl(category:string):string { return '/categories/'+getCategorySlug(category)+'/'; }
export function getCategories(posts:{data:CategoryData}[]):Category[] {
  const counts=new Map<string,number>();
  for(const post of posts)for(const category of getPostCategories(post.data))counts.set(category,(counts.get(category)??0)+1);
  return [...counts].map(([id,count])=>({id,count,label:getCategoryLabel(id)})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ko'));
}
