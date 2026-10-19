import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
export const BLOG_PATH = 'src/content/log';
// Keep the vault importer's frontmatter and existing URLs unchanged.
const log = defineCollection({
  loader: glob({pattern:'**/*.md',base:'./'+BLOG_PATH}),
  schema: z.object({
    title:z.string(), date:z.coerce.date(), category:z.string().default('LOG'), categories:z.array(z.string()).default([]), tags:z.array(z.string()).default([]), description:z.string().optional(), source:z.string().optional(), minutes:z.number().default(3),
    author:z.string().default('dobidugi'), modDatetime:z.coerce.date().optional(), featured:z.boolean().default(false), draft:z.boolean().default(false), ogImage:z.string().optional(),canonicalURL:z.string().optional(),hideEditPost:z.boolean().default(true),timezone:z.string().optional(),
  }).transform(data=>({...data,pubDatetime:data.date,description:data.description ?? data.title})),
});
const pages = defineCollection({loader:glob({pattern:'*.md',base:'./src/content/pages'}),schema:z.object({title:z.string(),description:z.string().optional(),ogImage:z.string().optional(),canonicalURL:z.string().optional()})});
export const collections={log,pages};
