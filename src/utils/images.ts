import type { ImageMetadata } from 'astro';

const ASSET_ROOT = '/src/assets/';

const assetModules = import.meta.glob<{ default: ImageMetadata }>(
    '/src/assets/**/*.{jpg,jpeg,png,webp,avif}',
    { eager: true },
);

export function findAsset(path: string | undefined): ImageMetadata | undefined {
    if (path === undefined) {
        return undefined;
    }
    const module = assetModules[ASSET_ROOT + path];
    if (module === undefined) {
        throw new Error(`Image "${path}" not found. Frontmatter image paths are relative to src/assets/.`);
    }
    return module.default;
}
