/** Load .env.local, then .env (earlier files win; real environment variables win over both). */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // File doesn't exist; that's fine.
    }
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}
