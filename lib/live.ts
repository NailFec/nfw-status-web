import type { LiveKind } from "@/lib/types"

type Listener = (kind: LiveKind) => void

type LiveState = {
  listeners: Set<Listener>
}

const globalKey = "__nfwStatusLive"

function state(): LiveState {
  const root = globalThis as typeof globalThis & { [globalKey]?: LiveState }
  if (!root[globalKey]) {
    root[globalKey] = { listeners: new Set() }
  }
  return root[globalKey]
}

export function subscribe(listener: Listener): () => void {
  const listeners = state().listeners
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publish(kind: LiveKind): void {
  for (const listener of state().listeners) {
    try {
      listener(kind)
    } catch {
      // A broken listener must not stop the others.
    }
  }
}
