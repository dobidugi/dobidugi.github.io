import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
const read=(relative)=>readFile(path.join(dist,relative),'utf8');
const sourceFiles=(await readdir(path.join(root,'src/content/log'))).filter(file=>file.endsWith('.md'));
const posts=await Promise.all(sourceFiles.map(async file=>({id:file.slice(0,-3),...matter(await readFile(path.join(root,'src/content/log',file),'utf8'))})));
const ids=html=>[...html.matchAll(/data-post="([^"]+)"/g)].map(match=>match[1]);
const home=await read('index.html');
assert.equal(new Set(ids(home)).size,posts.length,'Home must list every post exactly once');
assert.equal(ids(home).length,posts.length);
assert(home.includes(`전체 ${posts.length}편`));
assert(!home.includes('starfield'),'Space background must be absent');
const categories=new Map();
for(const post of posts){
  const page=await read(`log/${post.id}/index.html`);
  assert(page.includes(`https://dobidugi.github.io/log/${post.id}/`),`Canonical URL changed: ${post.id}`);
  assert(page.includes('data-pagefind-body'),`Post missing search indexing: ${post.id}`);
  assert(!/content="undefined"/.test(page),`Undefined metadata: ${post.id}`);
  if(post.content.includes('$$'))assert(page.includes('class="katex'),`Math not rendered: ${post.id}`);
  if(post.content.includes('class="mermaid"'))assert(page.includes('class="mermaid"'),`Mermaid source missing: ${post.id}`);
  for(const category of new Set([post.data.category,...(post.data.categories??[])])){
    if(!category)continue;
    if(!categories.has(category))categories.set(category,[]);
    categories.get(category).push(post.id);
  }
}
for(const [category,expected] of categories){
  const html=await read(`categories/${category.toLowerCase()}/index.html`);
  assert.deepEqual(ids(html).sort(),expected.sort(),`Wrong posts for ${category}`);
  assert(html.includes('aria-current="page"'),`Missing current category: ${category}`);
}
assert.equal(categories.get('JOURNAL').length,2,'Multi-category regression');
assert(categories.get('JOURNAL').includes('audit-and-access-log-design'));
assert(categories.get('ARCHITECTURE').includes('audit-and-access-log-design'));
async function walk(dir){
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.name==='2048'||entry.name==='pagefind')continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...await walk(file));
    else if(entry.name.endsWith('.html'))files.push(file);
  }
  return files;
}
let checked=0;
for(const file of await walk(dist)){
  const html=await readFile(file,'utf8');
  for(const [,url] of html.matchAll(/(?:href|src)="(\/[^"?#]*)(?:[?#][^"]*)?"/g)){
    if(url.startsWith('//'))continue;
    const decoded=decodeURIComponent(url).replaceAll('&amp;','&');
    const target=path.join(dist,decoded.replace(/^\//,''),decoded.endsWith('/')?'index.html':'');
    await access(target).catch(()=>{throw new Error(`Broken local URL ${url} in ${path.relative(dist,file)}`)});
    checked++;
  }
}
const feed=await read('rss.xml');
assert.equal((feed.match(/<item>/g)??[]).length,posts.length);
await access(path.join(dist,'pagefind/pagefind.js'));
await access(path.join(dist,'2048/index.html'));
await access(path.join(dist,'assets/원티드회고록/r1.png'));
await access(path.join(root,'licenses/AstroPaper.txt'));
console.log(`Verified ${posts.length} original post URLs, ${categories.size} category routes, math, feed, search assets, 2048 and ${checked} local links.`);
