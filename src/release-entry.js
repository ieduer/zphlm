import reader from './index.js';

export const VERSION_HEADER = 'X-ZPHLM-Worker-Version';

function versionId(env) {
  return String(env.CF_VERSION_METADATA?.id || 'unavailable');
}

export function withVersionHeader(response, env) {
  const witnessed = new Response(response.body, response);
  witnessed.headers.set(VERSION_HEADER, versionId(env));
  return witnessed;
}

export default {
  async fetch(request, env, ctx) {
    return withVersionHeader(await reader.fetch(request, env, ctx), env);
  },
};
