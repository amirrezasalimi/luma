export function validateLocalRequest(request: Request, port = Number(process.env.PORT || 3000)): Response | undefined {
  const url = new URL(request.url);
  const hosts = new Set(['localhost', '127.0.0.1'].map(host => port === 80 ? host : `${host}:${port}`));
  if (url.protocol !== 'http:' || !hosts.has(url.host) || !hosts.has(request.headers.get('host') || '')) {
    return Response.json({ error: 'Expected loopback Host with configured port' }, { status: 403 });
  }
  if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin)
    || request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
  }
}
