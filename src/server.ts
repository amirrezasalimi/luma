import { createServerEntry, createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { handleRequestCancellation } from './server/request-handler';

const handle = createStartHandler(defaultStreamHandler);

export default createServerEntry({
  fetch: (request, options) => handleRequestCancellation(request, async () => handle(request, options)),
});
