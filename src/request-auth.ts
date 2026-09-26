import { AsyncLocalStorage } from "node:async_hooks";

export interface HackerOneCredentials {
  username: string;
  token: string;
}

const credentialsStorage = new AsyncLocalStorage<HackerOneCredentials>();

export function runWithHackerOneCredentials<T>(
  credentials: HackerOneCredentials,
  callback: () => T
): T {
  return credentialsStorage.run(credentials, callback);
}

export function getHackerOneCredentials(): HackerOneCredentials | undefined {
  return credentialsStorage.getStore();
}
