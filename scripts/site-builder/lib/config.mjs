/**
 * Config resolution. One place, read once — nothing downstream re-derives a base URL.
 *
 * Only production hosts are baked in. Non-production targets must be named
 * explicitly via env, because this repo is public and internal hostnames are not.
 */

export const PROD_BASE_URL = 'https://sitebuilder.xsolla.com';
export const PROD_STORE_URL = 'https://store.xsolla.com/api/v2';

/**
 * SB_CUSTOM_URL keeps the MCP server's coupled behaviour: it overrides the base
 * URL *and* sets the x-custom-api-target header, which redirects server-generated
 * AI-block hosts at the same target. SB_BASE_URL overrides the URL only.
 */
export function loadConfig(env = process.env) {
  const customUrl = env.SB_CUSTOM_URL || undefined;
  const baseUrl = stripSlash(customUrl || env.SB_BASE_URL || PROD_BASE_URL);
  const storeUrl = stripSlash(env.SB_STORE_URL || PROD_STORE_URL);

  // No default on purpose: the publication service host is not public information.
  // Federated blocks are unavailable until this is set; native blocks are unaffected.
  const blocksServiceUrl = stripSlash(env.SB_BLOCKS_SERVICE_URL || '') || null;

  const cfg = {
    token: env.SB_TOKEN || null,
    baseUrl,
    apiUrl: `${baseUrl}/api`,
    storeUrl,
    blocksServiceUrl,
    customApiTarget: customUrl || null,
    dryRun: env.SB_DRY_RUN === '1',
    insecureTls: env.SB_INSECURE_TLS === '1',
    isProd: baseUrl === PROD_BASE_URL,
  };

  // The MCP server disabled TLS verification for every non-prod APP_ENV automatically.
  // Here it is opt-in only, and never honoured against production.
  if (cfg.insecureTls && cfg.isProd) {
    throw new ConfigError(
      'SB_INSECURE_TLS=1 refused: the target is production ' +
        `(${PROD_BASE_URL}). Certificate verification stays on for prod.`
    );
  }

  return cfg;
}

export class ConfigError extends Error {}

/** Fail loudly rather than firing a tokenless request the API will reject. */
export function requireToken(cfg, toolName) {
  if (!cfg.token) {
    throw new ConfigError(
      `${toolName} needs a Site Builder token. Set SB_TOKEN in the environment ` +
        '(export SB_TOKEN=... or add it to your shell profile), then retry.'
    );
  }
}

export function requireBlocksService(cfg, moduleId) {
  if (!cfg.blocksServiceUrl) {
    throw new ConfigError(
      `"${moduleId}" is a federated block, which needs the publication service. ` +
        'Set SB_BLOCKS_SERVICE_URL to its base URL and retry. ' +
        'Native modules work without it — call list_block_modules to see which are which.'
    );
  }
}

function stripSlash(u) {
  return typeof u === 'string' ? u.replace(/\/+$/, '') : u;
}
