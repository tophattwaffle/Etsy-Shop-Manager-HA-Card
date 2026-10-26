# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex and others) working in this repository.

This is the Home Assistant dashboard card (`custom:etsy-orders-card`, one JavaScript file) for the self-hosted Etsy
Shop Manager app. It reads the Open orders sensors of the
[Etsy-Shop-Manager-HA](https://github.com/TopHATTwaffle/Etsy-Shop-Manager-HA) integration. The app, its design docs
and the one to-do list for the app, the integration and this card live in the app repository,
[etsy-shop-manager](https://github.com/TopHATTwaffle/etsy-shop-manager).

## Backlog and docs
- Open work for this card is tracked in the app repository's `docs/BACKLOG.md`, not here. When you add, finish or drop
  work on this card, update that file too (a PR in the app repository), as its `AGENTS.md` asks.
- Keep `README.md` and the options described at the top of `etsy-orders-card.js` true in the same PR as any change.
- Order colors are drawn by the app (`OrderColorEngine`) and arrive already painted (`paint`, `personalization_paint`,
  `color_config.css`); the card only shows them. Change coloring in the app, never here.

## Releases
- Bump the version in the first line of `etsy-orders-card.js` and tag the merge commit `vX.Y.Z`; HACS only offers an
  update for a new tag.

## Public repository
This repository is mirrored publicly on GitHub: never write personal names or emails, private hostnames or LAN
addresses, API keys, or real order or customer data into code, docs or commit messages.
