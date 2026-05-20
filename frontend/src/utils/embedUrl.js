export function isValidEmbedUrl(s) {
  if (!s || typeof s !== 'string') return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseSceneEmbedFromMessage(data) {
  if (data === '' || data === null || data === undefined) return '';
  const url = typeof data === 'string' ? data : data?.embedUrl;
  if (typeof url !== 'string') return null;
  if (url === '' || isValidEmbedUrl(url)) return url;
  return null;
}
