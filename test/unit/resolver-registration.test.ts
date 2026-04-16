import { describe, expect, it } from 'vitest';
import { ResolverRegistry } from '../../src/resolvers/registry.js';
import { AgentBackedResolver } from '../../src/resolvers/agent.js';
import type { Resolver } from '../../src/core/resolver.js';

function makeResolver(systemId: string): Resolver {
  return new AgentBackedResolver({
    systemId,
    modelSpec: 'openai:test-model',
    instructions: {
      systemPrompt: `You are a ${systemId} resolver.`,
    },
  });
}

describe('ResolverRegistry', () => {
  it('registers and retrieves a resolver', () => {
    const reg = new ResolverRegistry();
    const resolver = makeResolver('dnd5e');
    reg.register(resolver);

    expect(reg.get('dnd5e')).toBe(resolver);
  });

  it('lists registered systems', () => {
    const reg = new ResolverRegistry();
    reg.register(makeResolver('dnd5e'));
    reg.register(makeResolver('pf2e'));

    const systems = reg.list();
    expect(systems).toContain('dnd5e');
    expect(systems).toContain('pf2e');
    expect(systems).toHaveLength(2);
  });

  it('returns undefined for unknown system', () => {
    const reg = new ResolverRegistry();
    expect(reg.get('unknown')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    const reg = new ResolverRegistry();
    reg.register(makeResolver('dnd5e'));

    expect(() => reg.register(makeResolver('dnd5e'))).toThrow(/already registered/);
  });

  it('resolver system id matches registration key', () => {
    const reg = new ResolverRegistry();
    const resolver = makeResolver('dnd5e');
    reg.register(resolver);

    const retrieved = reg.get('dnd5e');
    expect(retrieved!.system).toBe('dnd5e');
  });
});
