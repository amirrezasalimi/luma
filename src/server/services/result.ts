export interface ServiceResult<T> { data: T; status: number }

export function result<T>(data: T, status = 200): ServiceResult<T> {
  return { data, status };
}

/** Handler-level compatibility adapters serialize service results for callers that still exercise the HTTP contract. */
export function resultResponse(value: ServiceResult<unknown>): Response {
  return Response.json(value.data, { status: value.status, headers: { 'Cache-Control': 'no-store' } });
}
