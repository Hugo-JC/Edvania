import type {ProviderCallbacks, ProviderClose, ProviderSession, WhatsAppConnectionProvider} from "./provider.ts";
import {WhatsAppProviderError} from "./provider.ts";
import {retryDelayMs} from "./retry.ts";
export {retryDelayMs} from "./retry.ts";

export type ConnectionStatus = "disconnected" | "connecting" | "qr_required" | "connected" | "logged_out" | "error";
export type ConnectionSnapshot = Readonly<{
  tenantId: string;
  connectionId: string;
  generation: number;
  status: ConnectionStatus;
  retryAttempt: number;
  qr?: string;
  qrExpiresAt?: number;
  lastError?: string;
}>;

type SessionState = {
  key: string;
  tenantId: string;
  connectionId: string;
  generation: number;
  status: ConnectionStatus;
  retryAttempt: number;
  qr?: string;
  qrExpiresAt?: number;
  lastError?: string;
  handle?: ProviderSession;
  cancelRetry?: () => void;
};

type Timer = (callback: () => void, delayMs: number) => () => void;
type Options = Readonly<{
  retryBaseMs?: number;
  retryMaxMs?: number;
  retryLimit?: number;
  random?: () => number;
  now?: () => number;
  schedule?: Timer;
}>;

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }
}

const defaultTimer: Timer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};
const safeProviderCode = (code: string) => /^[a-z0-9_]{1,80}$/.test(code) ? code : "provider_failure";

export class WhatsAppSessionManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly locks = new Map<string, Mutex>();
  private readonly provider: WhatsAppConnectionProvider;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly retryLimit: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly schedule: Timer;

  constructor(
    provider: WhatsAppConnectionProvider,
    options: Options = {},
  ) {
    this.provider = provider;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.retryMaxMs = options.retryMaxMs ?? 60_000;
    this.retryLimit = options.retryLimit ?? 5;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? defaultTimer;
    if (this.retryLimit < 0 || !Number.isInteger(this.retryLimit)) throw new RangeError("Retry limit must be a non-negative integer.");
  }

  async connect(tenantId: string, connectionId: string): Promise<ConnectionSnapshot> {
    this.validateScope(tenantId, connectionId);
    const key = this.sessionKey(tenantId, connectionId);
    return this.withLock(key, async () => {
      const state = this.getOrCreate(key, tenantId, connectionId);
      this.expireQrIfNeeded(state);
      if (state.status === "connected" || state.status === "connecting" || state.status === "qr_required") {
        return this.snapshot(state);
      }
      this.cancelRetry(state);
      state.generation += 1;
      state.retryAttempt = 0;
      state.status = "connecting";
      state.qr = undefined;
      state.qrExpiresAt = undefined;
      state.lastError = undefined;
      return this.startAttempt(state, state.generation);
    });
  }

  async disconnect(tenantId: string, connectionId: string, logout = false): Promise<ConnectionSnapshot> {
    this.validateScope(tenantId, connectionId);
    const key = this.sessionKey(tenantId, connectionId);
    return this.withLock(key, async () => {
      const state = this.getOrCreate(key, tenantId, connectionId);
      this.cancelRetry(state);
      state.generation += 1;
      const handle = state.handle;
      state.handle = undefined;
      state.qr = undefined;
      state.qrExpiresAt = undefined;
      state.status = logout ? "logged_out" : "disconnected";
      state.lastError = undefined;
      try {
        await handle?.disconnect(logout);
      } catch {
        state.status = "error";
        state.lastError = "disconnect_failed";
        throw new WhatsAppProviderError("disconnect_failed", false);
      }
      return this.snapshot(state);
    });
  }

  getStatus(tenantId: string, connectionId: string): ConnectionSnapshot {
    this.validateScope(tenantId, connectionId);
    const state = this.getOrCreate(this.sessionKey(tenantId, connectionId), tenantId, connectionId);
    this.expireQrIfNeeded(state);
    return this.snapshot(state);
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled([...this.sessions.values()].map((state) =>
      this.withLock(state.key, async () => {
        this.cancelRetry(state);
        state.generation += 1;
        const handle = state.handle;
        state.handle = undefined;
        state.qr = undefined;
        state.qrExpiresAt = undefined;
        state.status = "disconnected";
        state.lastError = undefined;
        try {
          await handle?.disconnect(false);
        } catch {
          state.status = "error";
          state.lastError = "disconnect_failed";
          throw new WhatsAppProviderError("disconnect_failed", false);
        }
      }),
    ));

    if (results.some((result) => result.status === "rejected")) {
      throw new WhatsAppProviderError("shutdown_failed", false);
    }
  }

  private async startAttempt(state: SessionState, generation: number): Promise<ConnectionSnapshot> {
    const callbacks: ProviderCallbacks = {
      onQr: (qr, expiresAt) => {
        if (!this.isCurrent(state, generation)) return;
        if (!qr || !Number.isFinite(expiresAt) || expiresAt <= this.now()) {
          state.status = "error";
          state.lastError = "invalid_qr_state";
          return;
        }
        state.status = "qr_required";
        state.qr = qr;
        state.qrExpiresAt = expiresAt;
      },
      onOpen: () => {
        if (!this.isCurrent(state, generation)) return;
        state.status = "connected";
        state.retryAttempt = 0;
        state.qr = undefined;
        state.qrExpiresAt = undefined;
        state.lastError = undefined;
      },
      onClose: (close) => this.handleClose(state, generation, close),
    };

    try {
      const handle = await this.provider.startConnection(state.tenantId, state.connectionId, callbacks);
      if (!this.isCurrent(state, generation) || state.status === "disconnected" || state.status === "logged_out" || state.status === "error") {
        await handle.disconnect(false);
        return this.snapshot(state);
      }
      state.handle = handle;
      return this.snapshot(state);
    } catch (error) {
      if (this.isCurrent(state, generation) && state.status === "connecting") {
        const providerError = error instanceof WhatsAppProviderError ? error : undefined;
        state.lastError = safeProviderCode(providerError?.code ?? "provider_start_failed");
        state.status = providerError?.retryable ? "disconnected" : "error";
        if (providerError?.retryable) this.scheduleReconnect(state, generation);
      }
      const providerError = error instanceof WhatsAppProviderError ? error : undefined;
      throw new WhatsAppProviderError(safeProviderCode(providerError?.code ?? "provider_start_failed"), providerError?.retryable ?? false);
    }
  }

  private handleClose(state: SessionState, generation: number, close: ProviderClose) {
    if (!this.isCurrent(state, generation)) return;
    state.handle = undefined;
    state.qr = undefined;
    state.qrExpiresAt = undefined;
    state.lastError = safeProviderCode(close.code);
    if (close.loggedOut) {
      state.status = "logged_out";
      state.retryAttempt = 0;
    } else if (close.retryable) {
      state.status = "disconnected";
      this.scheduleReconnect(state, generation);
    } else {
      state.status = "error";
    }
  }

  private scheduleReconnect(state: SessionState, generation: number) {
    if (state.retryAttempt >= this.retryLimit) {
      state.status = "error";
      state.lastError = state.lastError ?? "retry_limit_reached";
      return;
    }
    state.retryAttempt += 1;
    const delay = retryDelayMs(state.retryAttempt, this.retryBaseMs, this.retryMaxMs, this.random);
    state.cancelRetry = this.schedule(() => {
      state.cancelRetry = undefined;
      void this.withLock(state.key, async () => {
        if (!this.isCurrent(state, generation) || state.status !== "disconnected") return this.snapshot(state);
        state.generation += 1;
        state.status = "connecting";
        return this.startAttempt(state, state.generation);
      }).catch(() => {
        if (state.status === "connecting") {
          state.status = "error";
          state.lastError = "provider_start_failed";
        }
      });
    }, delay);
  }

  private cancelRetry(state: SessionState) {
    state.cancelRetry?.();
    state.cancelRetry = undefined;
  }

  private getOrCreate(key: string, tenantId: string, connectionId: string): SessionState {
    let state = this.sessions.get(key);
    if (!state) {
      state = {key, tenantId, connectionId, generation: 0, status: "disconnected", retryAttempt: 0};
      this.sessions.set(key, state);
    }
    return state;
  }

  private isCurrent(state: SessionState, generation: number) {
    return state.generation === generation;
  }

  private snapshot(state: SessionState): ConnectionSnapshot {
    const qrIsFresh = state.qrExpiresAt !== undefined && state.qrExpiresAt > this.now();
    return {
      tenantId: state.tenantId,
      connectionId: state.connectionId,
      generation: state.generation,
      status: state.qr && qrIsFresh ? state.status : state.status === "qr_required" ? "connecting" : state.status,
      retryAttempt: state.retryAttempt,
      ...(state.qr && qrIsFresh ? {qr: state.qr, qrExpiresAt: state.qrExpiresAt} : {}),
      ...(state.lastError ? {lastError: state.lastError} : {}),
    };
  }

  private withLock<T>(connectionId: string, run: () => Promise<T>): Promise<T> {
    let mutex = this.locks.get(connectionId);
    if (!mutex) {
      mutex = new Mutex();
      this.locks.set(connectionId, mutex);
    }
    return mutex.runExclusive(run);
  }

  private expireQrIfNeeded(state: SessionState) {
    if (state.status === "qr_required" && state.qrExpiresAt !== undefined && state.qrExpiresAt <= this.now()) {
      state.status = "disconnected";
      state.qr = undefined;
      state.qrExpiresAt = undefined;
      state.lastError = "qr_expired";
    }
  }

  private sessionKey(tenantId: string, connectionId: string) {
    return JSON.stringify([tenantId, connectionId]);
  }

  private validateScope(tenantId: string, connectionId: string) {
    if (!tenantId.trim() || tenantId.length > 128) throw new RangeError("Invalid WhatsApp tenant id.");
    if (!connectionId.trim() || connectionId.length > 128) throw new RangeError("Invalid WhatsApp connection id.");
  }
}
