/**
 * Ambient types for `imapflow` — an OPTIONAL runtime dependency used only by
 * the email-to-ticket worker (`npm i imapflow` when a mailbox is enabled).
 * The app never imports it at module scope, so no dependency is required to
 * build or run the rest of the product.
 */
declare module "imapflow" {
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    logger?: false;
  }

  export interface MailboxLock {
    release(): void;
  }

  export interface FetchMessageObject {
    uid: number;
    seq: number;
    seen?: boolean;
    envelope?: {
      subject?: string | string[];
      from?: { address?: string }[];
    };
    bodyParts?: Map<string, Buffer>;
  }

  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    getMailboxLock(mailbox: string): Promise<MailboxLock>;
    fetch(
      range: string,
      query: Record<string, unknown>,
      options?: { uid?: boolean },
    ): AsyncIterable<FetchMessageObject>;
    messageFlagsAdd(
      range: { uid: number },
      flags: string[],
      options?: { uid?: boolean },
    ): Promise<unknown>;
  }
}