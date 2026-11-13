export type ImageFocus = 'top' | 'center' | 'bottom';

export interface PageFrontmatter {
    title: string;
    displaytitle?: string;
    navTitle?: string;
    subtitle?: string;
    tagline?: string;
    description?: string;
    image?: string;
    imageFocus?: ImageFocus;
    draconic?: boolean;
    order?: number;
    hidden?: boolean;
}

export interface NavNode {
    title: string;
    href?: string;
    description?: string;
    image?: string;
    imageFocus?: ImageFocus;
    order: number;
    children: NavNode[];
}

interface PageEntry {
    href: string;
    frontmatter: PageFrontmatter;
}

const DEFAULT_ORDER = 100;

const pageModules = import.meta.glob<{ frontmatter: PageFrontmatter }>('../pages/**/*.mdx');

function hrefFromModulePath(modulePath: string): string {
    const route = modulePath
        .replace(/^\.\.\/pages/, '')
        .replace(/\.mdx$/, '')
        .replace(/\/index$/, '');
    return route + '/';
}

function titleFromSlug(slug: string): string {
    const words = slug.split('-');
    const capitalised = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    return capitalised.join(' ');
}

function compareNodes(a: NavNode, b: NavNode): number {
    if (a.order !== b.order) {
        return a.order - b.order;
    }
    return a.title.localeCompare(b.title);
}

function sortTree(node: NavNode): void {
    node.children.sort(compareNodes);
    for (const child of node.children) {
        sortTree(child);
    }
}

async function loadPages(): Promise<PageEntry[]> {
    const entries: PageEntry[] = [];
    for (const [modulePath, load] of Object.entries(pageModules)) {
        const module = await load();
        entries.push({ href: hrefFromModulePath(modulePath), frontmatter: module.frontmatter });
    }
    return entries;
}

async function buildTree(): Promise<NavNode> {
    const root: NavNode = { title: 'Home', href: '/', order: 0, children: [] };
    const nodesByRoute = new Map<string, NavNode>();
    nodesByRoute.set('/', root);

    for (const page of await loadPages()) {
        if (page.href === '/' || page.frontmatter.hidden) {
            continue;
        }

        let parent = root;
        let route = '/';
        for (const segment of page.href.split('/').filter(Boolean)) {
            route = route + segment + '/';
            let node = nodesByRoute.get(route);
            if (node === undefined) {
                node = { title: titleFromSlug(segment), order: DEFAULT_ORDER, children: [] };
                nodesByRoute.set(route, node);
                parent.children.push(node);
            }
            parent = node;
        }

        parent.title = page.frontmatter.navTitle ?? page.frontmatter.title;
        parent.href = page.href;
        parent.description = page.frontmatter.description;
        parent.image = page.frontmatter.image;
        parent.imageFocus = page.frontmatter.imageFocus;
        parent.order = page.frontmatter.order ?? DEFAULT_ORDER;
    }

    sortTree(root);
    return root;
}

let cachedTree: Promise<NavNode> | undefined;

export function getNavTree(): Promise<NavNode> {
    if (import.meta.env.DEV) {
        return buildTree();
    }
    if (cachedTree === undefined) {
        cachedTree = buildTree();
    }
    return cachedTree;
}

export function normalisePath(pathname: string): string {
    if (pathname.endsWith('/')) {
        return pathname;
    }
    return pathname + '/';
}

export function isInBranch(node: NavNode, pathname: string): boolean {
    if (node.href !== undefined) {
        return normalisePath(pathname).startsWith(node.href);
    }
    return node.children.some((child) => isInBranch(child, pathname));
}

export function getTrail(root: NavNode, pathname: string): NavNode[] {
    const trail: NavNode[] = [];
    let level = root.children;
    let found = level.find((node) => isInBranch(node, pathname));
    while (found !== undefined) {
        trail.push(found);
        level = found.children;
        found = level.find((node) => isInBranch(node, pathname));
    }
    return trail;
}

export function findNode(root: NavNode, pathname: string): NavNode | undefined {
    const path = normalisePath(pathname);
    if (root.href === path) {
        return root;
    }
    const trail = getTrail(root, path);
    const last = trail[trail.length - 1];
    if (last !== undefined && last.href === path) {
        return last;
    }
    return undefined;
}

export function countPages(node: NavNode): number {
    let count = 0;
    for (const child of node.children) {
        if (child.href !== undefined) {
            count++;
        }
        count += countPages(child);
    }
    return count;
}
