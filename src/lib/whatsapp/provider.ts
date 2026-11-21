export type ProviderClose = Readonly<{
  code: string;
  loggedOut: boolean;
  retryable: boolean;
}>;

export type ProviderCallbacks = Readonly<{
  onQr: (qr: string, expiresAt: number) => void;
  onOpen: () => void;
  onClose: (close: ProviderClose) => void;
}>;

export type ProviderSession = Readonly<{
  disconnect: (logout: boolean) => Promise<void>;
}>;

export type SendTextResult = Readonly<{ providerMessageId: string }>;

export interface WhatsAppConnectionProvider {
  startConnection(tenantId: string, connectionId: string, callbacks: ProviderCallbacks): Promise<ProviderSession>;
}

export interface WhatsAppMessageSender {
  sendText(tenantId: string, connectionId: string, recipient: string, text: string, idempotencyKey: string): Promise<SendTextResult>;
}

export interface WhatsAppProvider extends WhatsAppConnectionProvider, WhatsAppMessageSender {}

export class WhatsAppProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    retryable: boolean,
  ) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.name = "WhatsAppProviderError";
  }
}

export class WhatsAppSendError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly deliveryUnknown: boolean;

  constructor(code: string, retryable: boolean, deliveryUnknown: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.deliveryUnknown = deliveryUnknown;
    this.name = "WhatsAppSendError";
  }
}
