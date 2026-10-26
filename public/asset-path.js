// Static editions can be served at any path, including LOB7's immutable prefix.
const base = new URL('.', import.meta.url);

export function gameAsset(path) {
  const local = String(path).replace(/^\/+/, '');
  if (/^[a-z][a-z\d+.-]*:/i.test(local) || local.includes('\\') || local.split('/').includes('..')) {
    throw new TypeError('A game asset must stay inside this static edition.');
  }
  return new URL(local, base).href;
}
