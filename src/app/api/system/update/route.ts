import { NextResponse } from "next/server";

export async function POST() {
  const socketPath = "/var/run/docker.sock";

  try {
    const { access } = await import("fs/promises");
    await access(socketPath);
  } catch {
    return NextResponse.json(
      {
        error: "Docker socket not available",
        hint: "Mount the Docker socket to enable one-click updates: -v /var/run/docker.sock:/var/run/docker.sock:ro",
        manualCommand: "docker compose pull && docker compose up -d",
      },
      { status: 503 }
    );
  }

  try {
    const { fetch: undiciFetch } = await import("undici");
    const pullRes = await undiciFetch(
      "http://localhost/images/create?fromImage=ghcr.io/dorkinatent/cchq&tag=latest",
      {
        method: "POST",
        dispatcher: await getUnixDispatcher(socketPath),
      }
    );

    if (!pullRes.ok) {
      const body = await pullRes.text();
      return NextResponse.json(
        { error: "Failed to pull image", details: body },
        { status: 502 }
      );
    }

    await pullRes.text();

    return NextResponse.json({
      status: "pulled",
      message:
        "New image pulled successfully. Restart your container to apply: docker compose up -d",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Update failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

async function getUnixDispatcher(socketPath: string) {
  const { Agent } = await import("undici");
  return new Agent({
    connect: { socketPath },
  });
}
