export interface StatementEvent {
  id: string;
  kind: string;
  scopeType: string;
  scopeKey: string | null;
}

export type EventHandler<T> = (data: T) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();

  on<T>(event: string, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler<unknown>);
    return () => {
      set!.delete(handler as EventHandler<unknown>);
      if (set!.size === 0) this.handlers.delete(event);
    };
  }

  emit<T>(event: string, data: T): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        // handlers must not throw synchronously —
        // event bus is infrastructure, not application logic
      }
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
