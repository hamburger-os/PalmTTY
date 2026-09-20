import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PalmTTYConfig } from "@palmtty/config";
import { FixedWindowLimiter } from "./security.js";

export const AUTH_COOKIE = "palmtty_session";

type LoginSession = {
  expiresAt: number;
};

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function assertAuthEnvironment(
  config: PalmTTYConfig["auth"],
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!config.enabled) return;
  const token = env[config.tokenEnv];
  if (!token || token.length < 16) {
    throw new Error(
      `Authentication is enabled but ${config.tokenEnv} is missing or shorter than the required 16 characters.`
    );
  }
}

export class AuthService {
  private readonly expectedToken?: Buffer;
  private readonly loginSessions = new Map<string, LoginSession>();
  private readonly loginLimiter = new FixedWindowLimiter(5, 60_000);

  constructor(
    readonly config: PalmTTYConfig["auth"],
    env: NodeJS.ProcessEnv = process.env
  ) {
    assertAuthEnvironment(config, env);
    if (config.enabled) {
      this.expectedToken = digest(env[config.tokenEnv]!);
    }
  }

  canAttemptLogin(source: string): boolean {
    return this.loginLimiter.allow(source);
  }

  verifyToken(source: string, token: string): boolean {
    if (!this.config.enabled || !this.expectedToken) return true;
    const supplied = digest(token);
    const valid = timingSafeEqual(this.expectedToken, supplied);
    if (valid) this.loginLimiter.reset(source);
    return valid;
  }

  createLoginSession(now = Date.now()): string {
    this.pruneExpired(now);
    while (this.loginSessions.size >= this.config.maxLoginSessions) {
      const oldest = this.loginSessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.loginSessions.delete(oldest);
    }

    const id = randomBytes(32).toString("base64url");
    this.loginSessions.set(id, {
      expiresAt: now + this.config.sessionTtlMinutes * 60_000
    });
    return id;
  }

  isAuthenticated(sessionId: string | undefined, now = Date.now()): boolean {
    if (!this.config.enabled) return true;
    if (!sessionId) return false;
    const session = this.loginSessions.get(sessionId);
    if (!session) return false;
    if (session.expiresAt <= now) {
      this.loginSessions.delete(sessionId);
      return false;
    }
    return true;
  }

  remainingSessionMs(sessionId: string | undefined, now = Date.now()): number | undefined {
    if (!this.config.enabled) return undefined;
    if (!sessionId) return undefined;
    const session = this.loginSessions.get(sessionId);
    if (!session) return undefined;
    const remaining = session.expiresAt - now;
    if (remaining <= 0) {
      this.loginSessions.delete(sessionId);
      return undefined;
    }
    return remaining;
  }

  revoke(sessionId: string | undefined): void {
    if (sessionId) this.loginSessions.delete(sessionId);
  }

  private pruneExpired(now: number): void {
    for (const [id, session] of this.loginSessions) {
      if (session.expiresAt <= now) this.loginSessions.delete(id);
    }
  }

  get enabled(): boolean {
    return this.config.enabled;
  }
}
