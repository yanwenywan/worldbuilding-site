// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import pagefind from 'astro-pagefind';
import remarkCallout from '@r4ai/remark-callout';
import remarkWikiLink from '@flowershow/remark-wiki-link';
import { remarkWikiLinkPages, scanPages, wikiLinkOptions } from './src/plugins/wikilinks.ts';

const pages = scanPages();

export default defineConfig({
    site: 'https://cm.yanwenyuan.uk',
    trailingSlash: 'always',
    integrations: [mdx(), pagefind()],
    markdown: {
        processor: unified({
            remarkPlugins: [
                remarkCallout,
                [remarkWikiLink, wikiLinkOptions(pages)],
                [remarkWikiLinkPages, pages],
            ],
        }),
    },
});
