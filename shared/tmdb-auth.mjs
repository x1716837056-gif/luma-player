// TMDB v3 accepts an API key as a query parameter or a read token as Bearer.
export function tmdbRequest(url, options, credential) {
  const value = credential.trim().replace(/^Bearer\s+/i, '');
  const target = new URL(url);
  const headers = new Headers(options?.headers);
  if (/^[a-f\d]{32}$/i.test(value)) {
    target.searchParams.set('api_key', value);
    headers.delete('Authorization');
  } else {
    headers.set('Authorization', `Bearer ${value}`);
  }
  return {url: target, options: {...options, headers}};
}
