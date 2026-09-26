import { AsyncLocalStorage } from "node:async_hooks";
import { getCache } from "@vercel/functions";

export interface HackerOneCredentials {
  username: string;
  token: string;
}

const credentialsStorage = new AsyncLocalStorage<HackerOneCredentials>();

function configCache() {
  return getCache({
    namespace: "h1-mcp-config",
    namespaceSeparator: ":",
  });
}

const DEFAULT_CREDENTIALS_KEY = "default-credentials";
const DEFAULT_CREDENTIALS_TTL = 30 * 24 * 60 * 60;

export function runWithHackerOneCredentials<T>(
  credentials: HackerOneCredentials,
  callback: () => T
): T {
  return credentialsStorage.run(credentials, callback);
}

export function getHackerOneCredentials(): HackerOneCredentials | undefined {
  return credentialsStorage.getStore();
}

export async function getDefaultHackerOneCredentials(): Promise<
  HackerOneCredentials | undefined
> {
  const value = (await configCache().get(
    DEFAULT_CREDENTIALS_KEY
  )) as HackerOneCredentials | undefined;

  if (!value?.username || !value?.token) return undefined;

  await configCache().set(DEFAULT_CREDENTIALS_KEY, value, {
    ttl: DEFAULT_CREDENTIALS_TTL,
    tags: ["h1-mcp-config"],
    name: "hackerone-default-credentials",
  });

  return value;
}

export async function setDefaultHackerOneCredentials(
  credentials: HackerOneCredentials
): Promise<void> {
  await configCache().set(DEFAULT_CREDENTIALS_KEY, credentials, {
    ttl: DEFAULT_CREDENTIALS_TTL,
    tags: ["h1-mcp-config"],
    name: "hackerone-default-credentials",
  });
}
