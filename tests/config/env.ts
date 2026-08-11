function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy tests/.env.example to tests/.env and fill it in.`
    );
  }
  return value;
}

export const TEST_USERNAME = requireEnv('TEST_USERNAME');
export const TEST_PASSWORD = requireEnv('TEST_PASSWORD');
export const TEST_WRONG_PASSWORD = requireEnv('TEST_WRONG_PASSWORD');
