// Content IDs are the vault importer's stable slugs, including any nested path.
export function getPostSlug(id: string, _filePath?: string): string { return id; }
export function getPostUrl(id: string, _filePath?: string, _locale?: string): string { return '/log/' + id.split('/').map(encodeURIComponent).join('/') + '/'; }
