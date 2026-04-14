import "server-only";
import os from "os";
import mdns from "multicast-dns";

let responder: ReturnType<typeof mdns> | null = null;

export function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const nets of Object.values(interfaces)) {
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

export function advertise(port: number): void {
  if (responder) return;

  const localName = process.env.LOCAL_NAME ?? "cchq";
  const hostname = `${localName}.local`;

  responder = mdns();

  responder.on("query", (query) => {
    const match = query.questions.find(
      (q) => q.name === hostname && q.type === "A",
    );
    if (!match) return;

    responder!.respond({
      answers: [
        {
          name: hostname,
          type: "A",
          ttl: 120,
          data: getLocalIP(),
        },
      ],
    });
  });

  console.log(`[mdns] responding to ${hostname} → http://${hostname}:${port}`);
}
