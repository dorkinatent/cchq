import { watch, FSWatcher, existsSync, statSync, openSync, readSync, closeSync } from "fs";
import type { RigEvent } from "../types";
import { parseEventLine } from "./parsers";

export type EventsTailer = {
  ready: Promise<void>;
  stop: () => void;
};

export function createEventsTailer(
  filePath: string,
  onEvent: (event: RigEvent) => void
): EventsTailer {
  let watcher: FSWatcher | null = null;
  let offset = 0;
  let stopped = false;

  const ready = new Promise<void>((resolve) => {
    const start = () => {
      if (stopped) return resolve();
      if (!existsSync(filePath)) {
        setTimeout(start, 500);
        return;
      }

      try {
        offset = statSync(filePath).size;
      } catch {
        offset = 0;
      }

      try {
        watcher = watch(filePath, { persistent: false }, () => {
          readNew();
        });
      } catch {
        setTimeout(start, 500);
        return;
      }

      resolve();
    };
    start();
  });

  function readNew() {
    if (stopped) return;
    let size: number;
    try {
      size = statSync(filePath).size;
    } catch {
      return;
    }

    if (size < offset) {
      offset = 0;
    }

    if (size <= offset) return;

    let fd: number;
    try {
      fd = openSync(filePath, "r");
    } catch {
      return;
    }

    const length = size - offset;
    const buf = Buffer.alloc(length);
    try {
      readSync(fd, buf, 0, length, offset);
    } catch {
      closeSync(fd);
      return;
    }
    closeSync(fd);
    offset = size;

    const text = buf.toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = parseEventLine(line);
      if (event) onEvent(event);
    }
  }

  return {
    ready,
    stop() {
      stopped = true;
      watcher?.close();
      watcher = null;
    },
  };
}
