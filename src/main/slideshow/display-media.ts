import { webContents } from 'electron'

export interface DisplayMediaRoute {
  /** Remembers the source a renderer will ask for next (FIFO per renderer). */
  remember(senderId: number, sourceId: string): void
  /** The oldest remembered source of the renderer that is not older than the TTL, removed; null when none. */
  take(senderId: number): string | null
}

/**
 * Creates a small per-renderer queue of desktop source ids. The renderer puts the source id in
 * before it calls getDisplayMedia, and the display media request handler takes it out again.
 */
export function createDisplayMediaRoute(
  ttlMs = 10_000,
  now: () => number = Date.now
): DisplayMediaRoute {
  const pending = new Map<number, { id: string; at: number }[]>()

  return {
    remember(senderId, sourceId) {
      const list = pending.get(senderId)
      if (list) list.push({ id: sourceId, at: now() })
      else pending.set(senderId, [{ id: sourceId, at: now() }])
    },
    take(senderId) {
      const list = pending.get(senderId)
      if (!list) return null

      while (list.length > 0 && now() - list[0].at > ttlMs) list.shift()

      const entry = list.shift()
      if (list.length === 0) pending.delete(senderId)

      return entry ? entry.id : null
    }
  }
}

type Sources = (types: ['window']) => Promise<Electron.DesktopCapturerSource[]>

/**
 * Answers getDisplayMedia from the app's own windows with the remembered slide show window;
 * anything else is refused.
 */
export function installDisplayMediaHandler(
  ses: Electron.Session,
  route: DisplayMediaRoute,
  getSources: Sources
): void {
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const wc = request.frame ? webContents.fromFrame(request.frame) : undefined
    if (!wc) {
      callback({})
      return
    }

    const id = route.take(wc.id)
    if (!id) {
      callback({})
      return
    }

    getSources(['window']).then(
      (list) => {
        const src = list.find((s) => s.id === id)
        if (src) callback({ video: src })
        else callback({})
      },
      () => callback({})
    )
  })
}
