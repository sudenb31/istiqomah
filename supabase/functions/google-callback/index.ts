import { createCallback } from '../_shared/callback.ts';

Deno.serve(createCallback(Deno.env.toObject()));
