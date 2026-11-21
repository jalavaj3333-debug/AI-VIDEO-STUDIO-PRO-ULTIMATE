# AI Video Studio Automation Worker

This directory contains source and Wrangler configuration for the existing
`ai-video-studio-automation` Cloudflare Worker.

## Bindings
- Workers AI: `AI`
- D1: `DB` → `ai-video-studio-db`
- KV: `MEDIA_KV` → `AI_VIDEO_MEDIA`

The existing D1 database is expected to contain the `automation_tasks` table.
This change does not create, migrate, or alter database tables.

## Required secrets
Set these in Cloudflare Worker settings or with Wrangler. Never commit their values:
- `SESSION_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `AUTOMATION_API_TOKEN` (optional when GitHub session authentication is used)

## Scheduled processing
The cron trigger runs every five minutes and processes pending tasks.

## Deployment
After reviewing and merging this change, deploy manually from this directory:

```sh
npx wrangler deploy --config wrangler.toml
```

This pull request does not deploy or change the live Cloudflare Worker.
