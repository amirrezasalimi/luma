import { expect, test } from 'bun:test';
import { handleRequestCancellation } from './src/server/request-handler';

test('returns successful responses unchanged', async () => {
  const response = new Response('ok');
  expect(await handleRequestCancellation(new Request('http://localhost'), async () => response)).toBe(response);
});

test('treats a disconnected request as cancellation', async () => {
  const controller = new AbortController();
  const request = new Request('http://localhost', { signal: controller.signal });
  const response = await handleRequestCancellation(request, async () => {
    controller.abort();
    request.signal.throwIfAborted();
    return new Response('unreachable');
  });
  expect(response.status).toBe(499);
  expect(await response.text()).toBe('');
});

test('preserves application errors even when the request disconnects', async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new Error('application failure');
  await expect(handleRequestCancellation(new Request('http://localhost', { signal: controller.signal }), async () => {
    throw error;
  })).rejects.toBe(error);
});

test('does not suppress unrelated abort errors on a live request', async () => {
  const error = new DOMException('Upstream aborted', 'AbortError');
  await expect(handleRequestCancellation(new Request('http://localhost'), async () => {
    throw error;
  })).rejects.toBe(error);
});
