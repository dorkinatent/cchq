// src/lib/mdns/broadcast.ts
// Broadcasts the CCHQ server on the local network via mDNS/Bonjour so future
// mobile/iOS clients can auto-discover it when they're on the same LAN.
import "server-only";
import { Bonjour, type Service } from "bonjour-service";

let instance: Bonjour | null = null;
let service: Service | null = null;
let started = false;

export function startMdnsBroadcast(port: number = 3000): void {
  if (started) return;
  started = true;
  try {
    instance = new Bonjour();
    service = instance.publish({
      name: "CCHQ",
      type: "cchq",
      protocol: "tcp",
      port,
      txt: { version: "1" },
    });
    console.log(`[mdns] broadcasting _cchq._tcp on port ${port}`);
  } catch (err) {
    console.error("[mdns] failed to broadcast", err);
    started = false;
  }
}

export function stopMdnsBroadcast(): void {
  try {
    service?.stop?.();
    instance?.destroy?.();
  } catch {
    // ignore teardown errors
  }
  service = null;
  instance = null;
  started = false;
}
