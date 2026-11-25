import N from '../data/news.json';
import feed from '../data/news_feed.json';

export type Src = [string, string];
export interface NewsItem { id: string; date: string; cat: string; title: string; summary: string; take: string; action: string; link?: string; sources: Src[] }
export interface Meeting { id: string; date: string; title: string; rate: string; credit: string; facts: string[]; take: string; hsinchu: string; sources: Src[] }
export interface FeedItem { title: string; link: string; source: string; date: string; topic: string }

export const news: NewsItem[] = [...(N.news as NewsItem[])].sort((a, b) => b.date.localeCompare(a.date));
export const meetings: Meeting[] = [...(N.meetings as Meeting[])].sort((a, b) => b.date.localeCompare(a.date));
export const policyRate = N.policyRate;
export const controls = N.controls as string[][];
export const mortgageRates = N.mortgageRates as [string, number | null, number | null][];
export const mortgageNote = N.mortgageNote;
export const qingan = N.qingan as { period: string; rules: string[][]; old: string; take: string; sources: Src[] };
export const watch = N.watch as string[][];
export const newsUpdated = N.updated;
export const feedData = feed as { updated: string | null; items: FeedItem[] };
export const cats = [...new Set(news.map((n) => n.cat))];
export const fmtDate = (d: string) => d.replace(/-/g, '/');
