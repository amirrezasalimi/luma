/** A disconnected client is a cancellation, not an application failure. */
export async function handleRequestCancellation(request: Request, handle: () => Promise<Response>): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    if (request.signal.aborted && (error === request.signal.reason || (error instanceof Error && error.name === 'AbortError'))) {
      return new Response(null, { status: 499, statusText: 'Client Closed Request' });
    }
    throw error;
  }
}
