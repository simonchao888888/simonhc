import F from '../data/founder.json';
import C from '../data/community.json';
import fs from 'node:fs';

export const founder = F;
export const community = C;
// public/founder.jpg（或 .png/.webp）存在就用照片，否則用插畫
export const photo = ['founder.jpg', 'founder.png', 'founder.webp'].find((f) => fs.existsSync(`public/${f}`));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 把「〔待填〕」標成黃底，提醒還沒填
export const fill = (s: string) => esc(s).replace(/〔([^〕]*)〕/g, '<mark class="todo">〔$1〕</mark>');
export const isTodo = (s?: string) => !s || s.includes('〔');
export const giscusOn = !!(C.giscus.repo && C.giscus.repoId && C.giscus.categoryId);
