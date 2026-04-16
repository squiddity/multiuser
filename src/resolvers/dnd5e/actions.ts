import type { ActionSpec } from '../../core/resolver.js';

export const dnd5eSkillActions: ActionSpec[] = [
  {
    name: 'Athletics',
    label: 'Athletics (STR)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  {
    name: 'Acrobatics',
    label: 'Acrobatics (DEX)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  {
    name: 'Sleight of Hand',
    label: 'Sleight of Hand (DEX)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  { name: 'Stealth', label: 'Stealth (DEX)', kind: 'skill-check', valid: true, paramsSchema: {} },
  { name: 'Arcana', label: 'Arcana (INT)', kind: 'skill-check', valid: true, paramsSchema: {} },
  { name: 'History', label: 'History (INT)', kind: 'skill-check', valid: true, paramsSchema: {} },
  {
    name: 'Investigation',
    label: 'Investigation (INT)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  { name: 'Medicine', label: 'Medicine (WIS)', kind: 'skill-check', valid: true, paramsSchema: {} },
  { name: 'Nature', label: 'Nature (INT)', kind: 'skill-check', valid: true, paramsSchema: {} },
  {
    name: 'Perception',
    label: 'Perception (WIS)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  { name: 'Religion', label: 'Religion (INT)', kind: 'skill-check', valid: true, paramsSchema: {} },
  { name: 'Survival', label: 'Survival (WIS)', kind: 'skill-check', valid: true, paramsSchema: {} },
  {
    name: 'Animal Handling',
    label: 'Animal Handling (WIS)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  { name: 'Insight', label: 'Insight (WIS)', kind: 'skill-check', valid: true, paramsSchema: {} },
  {
    name: 'Intimidation',
    label: 'Intimidation (CHA)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  {
    name: 'Persuasion',
    label: 'Persuasion (CHA)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  {
    name: 'Performance',
    label: 'Performance (CHA)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
  {
    name: 'Deception',
    label: 'Deception (CHA)',
    kind: 'skill-check',
    valid: true,
    paramsSchema: {},
  },
];

export function describeDnd5eActions(_actor: string): ActionSpec[] {
  return dnd5eSkillActions;
}
