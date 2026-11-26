import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guide = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guide' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['買房知識', '房貸知識', '稅費與法律', '房東與投資', '市場分析', '區域與建設']),
    tags: z.array(z.string()).default([]),
    pubDate: z.coerce.date(),
    order: z.number().default(99),
    // Simon 哥本人審閱後改成 true，署名才會顯示「Simon 哥」
    reviewed: z.boolean().default(false),
    updated: z.coerce.date().optional(),
  }),
});

// 新竹房市週報（scripts/weekly_report.py 自動產生）
const weekly = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/weekly' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    period: z.string(),
    cadence: z.string().default('週報'),
    highlights: z.array(z.string()).default([]),
  }),
});

export const collections = { guide, weekly };
