import assert from "node:assert/strict";
import WebSocket from "ws";

export const apiOrigin =
  process.env.FTNL_API_ORIGIN ?? "http://127.0.0.1:8080";
export const portalOrigin =
  process.env.FTNL_PORTAL_ORIGIN ?? "http://127.0.0.1:3000";

export interface Tunnel {
  tunnel_id: string;
  pairing_uri: string;
  desktop_capability: string;
}

export interface TunnelFile {
  file_id: string;
  name: string;
  media_type: string;
  size_bytes: number;
  bytes_transferred: number;
  status: string;
}

export interface TunnelSnapshot {
  tunnel_id: string;
  status: string;
  files: TunnelFile[];
}

export interface TunnelEvent {
  sequence: number;
  kind: string;
  file_id?: string;
  bytes_transferred?: number;
}

interface CreateOptions {
  accept?: string[];
  maxFiles?: number;
  maxFileBytes?: number;
}

export async function createTunnel(
  options: CreateOptions = {},
): Promise<Tunnel> {
  const response = await fetch(`${apiOrigin}/v1/tunnels`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      application_id: "ftnl-e2e",
      accept: options.accept ?? ["image/*"],
      max_files: options.maxFiles ?? 5,
      max_file_bytes: options.maxFileBytes ?? 1024 * 1024,
      expires_in_seconds: 120,
    }),
  });
  await assertStatus(response, 201);
  return response.json() as Promise<Tunnel>;
}

export async function snapshot(
  tunnel: Tunnel,
  capability = tunnel.desktop_capability,
): Promise<TunnelSnapshot> {
  const response = await fetch(
    `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}`,
    { headers: bearer(capability) },
  );
  await assertStatus(response, 200);
  return response.json() as Promise<TunnelSnapshot>;
}

export async function download(
  tunnel: Tunnel,
  fileId: string,
): Promise<Buffer> {
  const response = await fetch(
    `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}/files/${fileId}/content`,
    { headers: bearer(tunnel.desktop_capability) },
  );
  await assertStatus(response, 200);
  return Buffer.from(await response.arrayBuffer());
}

export async function cancel(tunnel: Tunnel): Promise<void> {
  const response = await fetch(
    `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}`,
    {
      method: "DELETE",
      headers: bearer(tunnel.desktop_capability),
    },
  );
  await assertStatus(response, 204);
}

export async function waitForSnapshot(
  tunnel: Tunnel,
  predicate: (value: TunnelSnapshot) => boolean,
): Promise<TunnelSnapshot> {
  return waitFor(async () => snapshot(tunnel), predicate);
}

export function pairingSecret(tunnel: Tunnel): string {
  const secret = new URLSearchParams(
    new URL(tunnel.pairing_uri).hash.slice(1),
  ).get("c");
  assert.ok(secret, "pairing URI must carry a fragment capability");
  return secret;
}

export function phoneSessionKey(tunnel: Tunnel): string {
  return `ftnl.phone.${tunnel.tunnel_id}`;
}

export class EventStream {
  readonly events: TunnelEvent[] = [];

  constructor(
    private readonly socket: WebSocket,
    private readonly ticket: string,
  ) {
    socket.on("message", (payload) => {
      this.events.push(JSON.parse(String(payload)) as TunnelEvent);
    });
  }

  async waitFor(kind: string): Promise<TunnelEvent> {
    const event = await waitFor(
      async () => this.events.find((event) => event.kind === kind),
      (value) => value !== undefined,
    );
    assert.ok(event);
    return event;
  }

  async assertTicketCannotBeReused(tunnel: Tunnel): Promise<void> {
    const wsOrigin = apiOrigin.replace(/^http/, "ws");
    const duplicate = new WebSocket(
      `${wsOrigin}/v1/tunnels/${tunnel.tunnel_id}/events?ticket=${encodeURIComponent(this.ticket)}`,
    );
    const outcome = await new Promise<"opened" | "rejected">((resolve) => {
      duplicate.once("open", () => resolve("opened"));
      duplicate.once("unexpected-response", () => resolve("rejected"));
      duplicate.once("error", () => resolve("rejected"));
    });
    duplicate.terminate();
    assert.equal(outcome, "rejected", "event tickets must be single use");
  }

  close(): void {
    this.socket.terminate();
  }
}

export async function subscribe(tunnel: Tunnel): Promise<EventStream> {
  const response = await fetch(
    `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}/event-tickets`,
    {
      method: "POST",
      headers: bearer(tunnel.desktop_capability),
    },
  );
  await assertStatus(response, 201);
  const { ticket } = (await response.json()) as { ticket: string };
  const wsOrigin = apiOrigin.replace(/^http/, "ws");
  const socket = new WebSocket(
    `${wsOrigin}/v1/tunnels/${tunnel.tunnel_id}/events?ticket=${encodeURIComponent(ticket)}`,
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return new EventStream(socket, ticket);
}

export async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

function bearer(capability: string): Record<string, string> {
  return { authorization: `Bearer ${capability}` };
}

async function assertStatus(
  response: Response,
  expected: number,
): Promise<void> {
  if (response.status !== expected) {
    assert.equal(response.status, expected, await response.text());
  }
}
