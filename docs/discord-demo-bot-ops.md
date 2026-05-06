# Discord Demo Bot Operations (local)

## Purpose

Run the milestone 0003 demo bot quickly, test it in a Discord server, and monitor logs during interactive validation.

## Environment variables

Set these in `.env`:

```env
DATABASE_URL=postgres://...
DEFAULT_MODEL_SPEC=openrouter:deepseek/deepseek-v4-flash
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

The bot uses `DEFAULT_MODEL_SPEC` for live narrator/worker behavior. The current default is `openrouter:deepseek/deepseek-v4-flash`.

Startup log should include:

- `discord demo bot ready`
- `registered guild onboarding commands` (or global)

## Quick Discord checks

1. In test guild, run `/ping` → expect `pong` (ephemeral).
2. Run `/start-onboarding`.
3. Walk through onboarding fields and confirmation.

## Lifecycle commands

- **Start:** `pnpm serve`
- **Stop:** `Ctrl+C`
- **Restart after env/code change:** stop then run `pnpm serve` again

## Monitoring while testing

Watch console logs in the running terminal for:

- bot startup
- interaction errors
- onboarding completion log with user id + draft summary

## Current scope of demo bot

The bot currently provides:

- `/ping`
- `/start-onboarding` with ephemeral-first flow
- private-thread escalation button
- in-memory onboarding session state (resets on process restart)

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
