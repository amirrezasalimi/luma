import { createFileRoute } from '@tanstack/react-router';
import { RPCHandler } from '@orpc/server/fetch';
import { router } from '../server/router';
import { validateLocalRequest } from '../server/security';

const handler = new RPCHandler(router);

export const Route = createFileRoute('/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const rejected = validateLocalRequest(request);
        if (rejected) return rejected;
        const { response } = await handler.handle(request, { prefix: '/rpc', context: { request } });
        if (!response) return new Response('Procedure not found', { status: 404 });
        response.headers.set('Cache-Control', 'no-store');
        return response;
      },
    },
  },
});
