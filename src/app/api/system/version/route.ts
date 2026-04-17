import { NextResponse } from "next/server";
import { APP_VERSION, isNewerVersion } from "@/lib/version";

type CachedRelease = {
  tag: string;
  url: string;
  fetchedAt: number;
};

let cache: CachedRelease | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      currentVersion: APP_VERSION,
      latestVersion: cache.tag.replace(/^v/, ""),
      updateAvailable: isNewerVersion(APP_VERSION, cache.tag),
      releaseUrl: cache.url,
    });
  }

  try {
    const res = await fetch(
      "https://api.github.com/repos/dorkinatent/cchq/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({
        currentVersion: APP_VERSION,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        error: "Could not check for updates",
      });
    }

    const data = await res.json();
    cache = {
      tag: data.tag_name,
      url: data.html_url,
      fetchedAt: now,
    };

    return NextResponse.json({
      currentVersion: APP_VERSION,
      latestVersion: cache.tag.replace(/^v/, ""),
      updateAvailable: isNewerVersion(APP_VERSION, cache.tag),
      releaseUrl: cache.url,
    });
  } catch {
    return NextResponse.json({
      currentVersion: APP_VERSION,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      error: "Could not check for updates",
    });
  }
}
