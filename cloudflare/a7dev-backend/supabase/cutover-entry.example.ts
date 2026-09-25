import { routeRequest } from './router.ts';
Deno.serve((req: Request) => routeRequest(req));
