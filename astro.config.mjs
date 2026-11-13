// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import pagefind from 'astro-pagefind';
import remarkCallout from '@r4ai/remark-callout';

export default defineConfig({
    site: 'https://cm.yanwenyuan.uk',
    trailingSlash: 'always',
    integrations: [mdx(), pagefind()],
    markdown: {
        processor: unified({
            remarkPlugins: [remarkCallout],
        }),
    },
});
