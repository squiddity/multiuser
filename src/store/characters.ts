// User ↔ character resolvers. See docs/memory-model.md → User–character relationship.
//
// v1: no character entities yet. Both resolvers return the null/empty answer so
// retrieval's {type:'character'} wildcards drop cleanly. When the characters
// table lands, fill these in without changing call sites:
//
//   getActingCharacter: latest non-superseded `acting-as` statement for this
//     user in this room, fallback to primary-owned character if exactly one.
//   getCharactersForUser: union of primary-owned + active delegations in room.

export async function getActingCharacter(_userId: string, _roomId: string): Promise<string | null> {
  return null;
}

export async function getCharactersForUser(_userId: string, _roomId: string): Promise<string[]> {
  return [];
}
