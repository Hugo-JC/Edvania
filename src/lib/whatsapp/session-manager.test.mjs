import test from "node:test";
import assert from "node:assert/strict";
import {retryDelayMs, WhatsAppSessionManager} from "./session-manager.ts";

function createMockProvider() {
  const starts = [];
  return {
    starts,
    provider: {
      async startConnection(tenantId, connectionId, callbacks) {
        const session = {
          tenantId,
          connectionId,
          callbacks,
          disconnectCalls: [],
        };
        starts.push(session);
        return {
          async disconnect(logout) {
            session.disconnectCalls.push(logout);
          },
        };
      },
      async sendText(tenantId, connectionId, recipient, text, idempotencyKey) {
        return {providerMessageId: `${tenantId}:${connectionId}:${recipient}:${idempotencyKey}`};
      },
    },
  };
}

test("connection lock prevents concurrent duplicate provider starts", async () => {
  const {provider, starts} = createMockProvider();
  const manager = new WhatsAppSessionManager(provider);

  const states = await Promise.all([
    manager.connect("tenant-1", "connection-1"),
    manager.connect("tenant-1", "connection-1"),
  ]);

  assert.equal(starts.length, 1);
  assert.equal(states[0].generation, states[1].generation);
});

test("callbacks from a disconnected socket cannot change the active generation", async () => {
  const {provider, starts} = createMockProvider();
  const manager = new WhatsAppSessionManager(provider);

  await manager.connect("tenant-1", "connection-1");
  const oldCallbacks = starts[0].callbacks;
  await manager.disconnect("tenant-1", "connection-1");
  await manager.connect("tenant-1", "connection-1");
  starts[1].callbacks.onOpen();
  oldCallbacks.onOpen();

  assert.equal(manager.getStatus("tenant-1", "connection-1").status, "connected");
  assert.equal(manager.getStatus("tenant-1", "connection-1").generation, 3);
});

test("logout stops automatic reconnect and clears QR state", async () => {
  const {provider, starts} = createMockProvider();
  const scheduled = [];
  const manager = new WhatsAppSessionManager(provider, {
    schedule(callback, delayMs) {
      scheduled.push({callback, delayMs});
      return () => undefined;
    },
    random: () => 0.5,
  });

  await manager.connect("tenant-1", "connection-1");
  starts[0].callbacks.onQr("ephemeral-qr", Date.now() + 30_000);
  starts[0].callbacks.onClose({code: "logged_out", loggedOut: true, retryable: false});

  const status = manager.getStatus("tenant-1", "connection-1");
  assert.equal(status.status, "logged_out");
  assert.equal(status.qr, undefined);
  assert.equal(scheduled.length, 0);
});

test("provider close errors are sanitized before leaving the session manager", async () => {
  const {provider, starts} = createMockProvider();
  const manager = new WhatsAppSessionManager(provider);

  await manager.connect("tenant-1", "connection-1");
  starts[0].callbacks.onClose({code: "token=private-value", loggedOut: false, retryable: false});

  assert.equal(manager.getStatus("tenant-1", "connection-1").lastError, "provider_failure");
});

test("connection state and provider starts are isolated by tenant", async () => {
  const {provider, starts} = createMockProvider();
  const manager = new WhatsAppSessionManager(provider);

  await manager.connect("tenant-a", "connection-1");
  await manager.connect("tenant-b", "connection-1");
  starts[0].callbacks.onOpen();

  assert.equal(starts.length, 2);
  assert.equal(manager.getStatus("tenant-a", "connection-1").status, "connected");
  assert.equal(manager.getStatus("tenant-b", "connection-1").status, "connecting");
  assert.equal(starts[1].tenantId, "tenant-b");
});

test("expired QR state is not exposed and can be restarted", async () => {
  const {provider, starts} = createMockProvider();
  let now = 100;
  const manager = new WhatsAppSessionManager(provider, {now: () => now});

  await manager.connect("tenant-1", "connection-1");
  starts[0].callbacks.onQr("expired-qr", 150);
  now = 151;

  assert.equal(manager.getStatus("tenant-1", "connection-1").status, "disconnected");
  assert.equal(manager.getStatus("tenant-1", "connection-1").qr, undefined);
  await manager.connect("tenant-1", "connection-1");
  assert.equal(starts.length, 2);
});

test("retry uses capped exponential backoff with bounded jitter", () => {
  assert.equal(retryDelayMs(1, 1_000, 10_000, () => 0), 500);
  assert.equal(retryDelayMs(2, 1_000, 10_000, () => 1), 2_000);
  assert.equal(retryDelayMs(8, 1_000, 5_000, () => 1), 5_000);
  assert.throws(() => retryDelayMs(0, 1_000, 5_000, () => 0), RangeError);
});

test("retry limit prevents reconnect loops after repeated provider closes", async () => {
  const {provider, starts} = createMockProvider();
  const scheduled = [];
  const manager = new WhatsAppSessionManager(provider, {
    retryLimit: 1,
    schedule(callback) {
      scheduled.push(callback);
      return () => undefined;
    },
    random: () => 1,
  });

  await manager.connect("tenant-1", "connection-1");
  starts[0].callbacks.onClose({code: "network", loggedOut: false, retryable: true});
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts.length, 2);

  starts[1].callbacks.onClose({code: "network", loggedOut: false, retryable: true});
  assert.equal(manager.getStatus("tenant-1", "connection-1").status, "error");
  assert.equal(scheduled.length, 1);
});

test("shutdown cancels retries, closes active sessions, and invalidates callbacks", async () => {
  const {provider, starts} = createMockProvider();
  const scheduled = [];
  const cancelled = [];
  const manager = new WhatsAppSessionManager(provider, {
    schedule(callback) {
      scheduled.push(callback);
      return () => cancelled.push(true);
    },
  });

  await manager.connect("tenant-1", "active");
  await manager.connect("tenant-1", "retrying");
  starts[1].callbacks.onClose({code: "network", loggedOut: false, retryable: true});
  const staleCallback = starts[0].callbacks.onOpen;
  await manager.shutdown();
  staleCallback();

  assert.deepEqual(starts[0].disconnectCalls, [false]);
  assert.deepEqual(cancelled, [true]);
  assert.equal(manager.getStatus("tenant-1", "active").status, "disconnected");
  assert.equal(manager.getStatus("tenant-1", "active").qr, undefined);
  assert.equal(manager.getStatus("tenant-1", "active").generation, 2);
  assert.equal(scheduled.length, 1);
});

test("shutdown reports a sanitized error when a provider socket cannot close", async () => {
  let closedSessions = 0;
  const provider = {
    async startConnection(_tenantId, connectionId) {
      return {
        async disconnect() {
          if (connectionId === "broken") throw new Error("credential=must_not_leak");
          closedSessions += 1;
        },
      };
    },
  };
  const manager = new WhatsAppSessionManager(provider);

  await manager.connect("tenant-1", "healthy");
  await manager.connect("tenant-1", "broken");
  await assert.rejects(manager.shutdown(), (error) => {
    assert.equal(error.code, "shutdown_failed");
    assert.equal(error.message, "shutdown_failed");
    assert.equal(error.message.includes("must_not_leak"), false);
    return true;
  });
  assert.equal(closedSessions, 1);
  assert.equal(manager.getStatus("tenant-1", "healthy").status, "disconnected");
  assert.equal(manager.getStatus("tenant-1", "broken").status, "error");
});
