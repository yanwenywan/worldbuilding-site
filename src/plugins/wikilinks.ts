// Wikilink support: [[file-name]], [[file-name|text]], [[file-name#heading]].
// Parsing and resolution come from @flowershow/remark-wiki-link; this file feeds it the page list,
// then checks the results, sets display text and records each page's links for backlinks.
// The page list is read once at startup, so restart `npm run dev` after adding or renaming pages.
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { VFile } from 'vfile';

const PAGES_DIR = 'src/pages';

export interface WikiPage {
    linkFile: string;
    route: string;
    name: string;
    label: string;
}

interface WikiLinkNode {
    type: 'wikiLink';
    value: string;
    data: {
        alias?: string;
        existing: boolean;
        path: string;
        hChildren: { type: 'text'; value: string }[];
    };
    position?: { start: { line: number } };
}

interface AstroFileData {
    astro: { frontmatter: Record<string, unknown> };
}

function routeFromFile(file: string): string {
    const withoutExtension = file.replace(/\.mdx$/, '');
    if (withoutExtension === 'index') {
        return '/';
    }
    const route = withoutExtension.replace(/\/index$/, '');
    return '/' + route + '/';
}

function readFrontmatter(absolutePath: string): Record<string, unknown> {
    const source = fs.readFileSync(absolutePath, 'utf8');
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match === null) {
        return {};
    }
    return parseYaml(match[1]) ?? {};
}

export function scanPages(): WikiPage[] {
    const files = fs.globSync('**/*.mdx', { cwd: PAGES_DIR });
    const pages: WikiPage[] = [];
    for (const file of files) {
        const route = routeFromFile(file);
        const segments = route.split('/').filter(Boolean);
        let name = 'index';
        if (segments.length > 0) {
            name = segments[segments.length - 1];
        }
        const frontmatter = readFrontmatter(path.join(PAGES_DIR, file));
        const label = String(frontmatter.navTitle ?? frontmatter.title ?? name);
        let linkFile = 'index.mdx';
        if (route !== '/') {
            linkFile = route.slice(1, -1) + '.mdx';
        }
        pages.push({ linkFile, route, name, label });
    }
    return pages;
}

export function wikiLinkOptions(pages: WikiPage[]) {
    const permalinks: Record<string, string> = {};
    for (const page of pages) {
        permalinks[page.linkFile] = page.route;
    }
    return {
        format: 'shortestPossible',
        files: pages.map((page) => page.linkFile),
        permalinks,
    };
}

function relativeSourcePath(file: VFile): string {
    if (file.path === undefined) {
        return 'unknown file';
    }
    return path.relative(process.cwd(), file.path);
}

export function remarkWikiLinkPages(pages: WikiPage[]) {
    const pagesByName = new Map<string, WikiPage[]>();
    const pagesByRoute = new Map<string, WikiPage>();
    for (const page of pages) {
        const pagesWithName = pagesByName.get(page.name) ?? [];
        pagesWithName.push(page);
        pagesByName.set(page.name, pagesWithName);
        pagesByRoute.set(page.route, page);
    }

    return (tree: Root, file: VFile) => {
        const links = new Set<string>();

        visit(tree, 'wikiLink', (visited) => {
            const node = visited as unknown as WikiLinkNode;
            const target = node.value.split('#')[0];
            const line = node.position?.start.line ?? 0;
            const where = `${relativeSourcePath(file)}:${line}`;

            if (!node.data.existing) {
                console.warn(`[wikilinks] ${where}: no page named "${target}" for [[${node.value}]]`);
                return;
            }

            const matches = pagesByName.get(target) ?? [];
            if (!target.includes('/') && matches.length > 1) {
                const options = matches.map((page) => page.route.slice(1, -1)).join(', ');
                throw new Error(`[wikilinks] ${where}: [[${node.value}]] matches several pages (${options}). Use a longer path.`);
            }

            const route = node.data.path.split('#')[0];
            links.add(route);

            const page = pagesByRoute.get(route);
            if (node.data.alias === undefined && page !== undefined) {
                node.data.hChildren = [{ type: 'text', value: page.label }];
            }
        });

        const astroData = file.data as unknown as AstroFileData;
        astroData.astro.frontmatter.links = [...links];
    };
}
