import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { router } from '../../server/router';

export const rpc: RouterClient<typeof router> = createORPCClient(new RPCLink({
  origin: () => location.origin,
  url: '/rpc',
}));
