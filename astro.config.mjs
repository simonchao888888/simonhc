import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 正式網域 simonhc.com；要換網域時改這裡或設定環境變數 SITE_URL
export default defineConfig({
  site: process.env.SITE_URL || 'https://simonhc.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // 示範頁（模擬資料）與表單送出後的感謝頁不送搜尋引擎
  integrations: [sitemap({ filter: (p) => !/\/presale\/sample\/|\/community\/thanks\//.test(p) })],
});
