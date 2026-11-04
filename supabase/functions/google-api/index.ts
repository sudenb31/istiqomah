import { createApi } from '../_shared/api.ts';

Deno.serve(createApi(Deno.env.toObject()));
