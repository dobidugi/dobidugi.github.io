import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const log = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/log' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string().default('LOG'),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    source: z.string().optional(),
    minutes: z.number().default(3),
  }),
});

export const collections = { log };
