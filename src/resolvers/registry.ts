import type { Resolver } from '../core/resolver.js';

export class ResolverRegistry {
  private readonly resolvers = new Map<string, Resolver>();

  register(resolver: Resolver): void {
    if (this.resolvers.has(resolver.system)) {
      throw new Error(`resolver already registered for system: ${resolver.system}`);
    }
    this.resolvers.set(resolver.system, resolver);
  }

  get(system: string): Resolver | undefined {
    return this.resolvers.get(system);
  }

  list(): string[] {
    return Array.from(this.resolvers.keys());
  }
}
