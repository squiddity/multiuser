# Discord Demo Bot Operations (local)

## Purpose

Run the milestone 0003 demo bot quickly, test it in a Discord server, and monitor logs during interactive validation.

## Environment variables

Set these in `.env`:

```env
DATABASE_URL=postgres://...
DEFAULT_MODEL_SPEC=openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=optional_test_guild_id
```

Notes:

- `DISCORD_GUILD_ID` is recommended for fast slash-command registration in a test server.
- If `DISCORD_GUILD_ID` is omitted, commands are registered globally (can take longer to appear).

## Start the app + demo bot

```bash
pnpm serve
```

What starts:

- API server + workers
- Discord demo bot (if `DISCORD_BOT_TOKEN` is set)

The bot uses `DEFAULT_MODEL_SPEC` for live narrator/worker behavior. The current default is `openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5`.
If the primary model fails during a `/say` turn, the bot automatically retries narration once with fallback `openrouter:openai/gpt-4o-mini`.

Startup log should include:

- `discord demo bot ready`
- `registered guild onboarding commands` (or global)

## Quick Discord checks

1. In test guild, run `/ping` → expect `pong` (ephemeral).
2. Run `/start-onboarding`.
3. Walk through onboarding fields and confirmation.
4. Confirm the bot created or reused the demo channels (`onboarding-intake`, `party-1`, `gm-briefings`).
5. After onboarding completion, switch to the assigned `party-1` channel.
6. Run `/say text:<something in-character>` there.
7. Expect a visible character-action echo followed by narrator output in-channel.
8. If you try `/say` before onboarding or in the wrong channel, expect an ephemeral refusal.

## Lifecycle commands

- **Start:** `pnpm serve`
- **Stop:** `Ctrl+C`
- **Restart after env/code change:** stop then run `pnpm serve` again

## Monitoring while testing

Watch console logs in the running terminal for:

- bot startup
- guild projection readiness (room↔channel mappings)
- interaction errors
- onboarding completion log with user id + draft summary
- `discord party turn submitted` entries for `/say` narration turns

## Current scope of demo bot

The bot currently provides:

- `/ping`
- `/start-onboarding` with ephemeral-first flow and automatic Discord-account linking
- startup room/channel projection for the demo guild (`onboarding-intake`, `party-1`, `gm-briefings`)
- onboarding completion that creates a durable player definition (`userId` + `characterId` + mapped room/channel), grants party access, and posts a first-turn handoff in the destination channel
- `/say` for the shared party narration loop
  - rejects users who have not completed onboarding
  - rejects users who invoke it outside their mapped party channel
  - responds in two phases: quick visible player echo first, narrator follow-up second
  - keeps Discord's typing indicator active while the narrator call is in flight
  - supports an admin-only demo override (`user=Player A|Player B`) for validation with synthetic actors
- private-thread escalation button
- statement-backed onboarding session state via the generic workflow session store (persists across process restart)
- event-driven party-turn writes that trigger downstream workers such as briefing generation

## First successful local run (2026-04-24)

Validated in a real Discord test guild:

- `/ping` responded successfully.
- `/start-onboarding` worked end-to-end for one user.
- Four onboarding fields were completed.
- Private thread path was used during the run.
- App logs recorded onboarding completion payload.

## Known follow-up

- ✅ Resolved (2026-04-24): interaction replies now use `flags`-based ephemeral responses in `src/adapters/discord/demo-bot.ts`.
- ✅ Resolved (2026-04-24): Discord startup now uses `clientReady` instead of deprecated `ready` in `src/adapters/discord/demo-bot.ts`.

## Troubleshooting

- Commands not appearing:
  - Verify bot is invited with `applications.commands` scope.
  - Set `DISCORD_GUILD_ID` to your test guild and restart.
- Bot online but no responses:
  - Check token validity and permissions.
  - Inspect terminal for `discord interaction failed` logs.
- Private thread creation fails:
  - Verify bot can create private threads in the channel/category.
