# AGENTS.md

This repo is a [Termix](https://github.com/Termix-SSH/Termix) plugin. These notes are for AI coding tools.

## Read first

Before changing anything, read `node_modules/@termix-ssh/plugin-sdk/PLUGIN-GUIDE.md`. It covers the
manifest, backend, database, frontend, UI, testing, releasing and submitting to the community registry,
and it matches the SDK version installed here. If the guide and the SDK's TypeScript types disagree, the
types are right.

The look and the structure follow the Termix-PVE plugin (https://github.com/sbrw-evc/Termix-PVE): the
same sidebar tree, `PanelShell`, square flat lists, `forms.tsx` and the host settings pattern.

## Commands

```bash
npm run build        # bundle into dist/
npm test             # run the tests
npm run typecheck    # type check
npm run validate     # check manifest.json, migrations, changelog and docs
npm run pack         # write <id>-<version>.tmxplug
npm run format       # format with Prettier
npm run live         # check the RouterOS clients against the router in .env.local (reads only)
```

`npx termix-plugin dev --server <url> --key <tmx_...>` installs the plugin on a Termix server with
developer mode on and reinstalls it on every save. Don't start it unless the user asks.

## Done means

- `npm test`, `npm run typecheck`, `npm run validate`, `npm run build` and `npm run format:check` pass
- New UI text is in `locales/en.json`, new routes have an `@openapi` block and a test
- `docs/` and the section below still match what the plugin does
- User facing changes are in `CHANGELOG.md` under the version they ship in

## About this plugin

- What it does: replaces WinBox for MikroTik RouterOS v6 and v7. A host becomes a router through its
  `enableRouterOs` host setting; the MikroTik tool in the rail's Tools band is hidden until one exists
  (`RailItemSync` in `src/frontend/index.tsx`).
- One command shape for both protocols (`src/backend/ros/command.ts`): menu path, command, attrs,
  proplist, query. The API (`ros/api.ts`) sends `/ip/address/print =k=v ?k=v`; REST (`ros/rest.ts`)
  sends `POST /rest/ip/address/print` with the attrs as JSON, `.proplist` and `.query`. Every command
  goes through POST, print and add included, so the two map one to one.
- Transports (`ros/connection.ts`): `api-tunnel` (default) and `rest-tunnel` go through
  `ctx.ssh.withConnection` + `forwardOut` to 127.0.0.1 on the router, which needs
  `/ip ssh forwarding-enabled`; `rest` goes through `ctx.fetch`; `api` opens a TCP/TLS socket with
  `node:net`, since ctx has no raw sockets. API sessions are pooled per
  actor, host, address and login (`ApiSessionPool`), and close after a minute idle or on disable: a login per
  call filled the router's log with "logged in via api". REST logs in on every request (Basic auth).
- API sessions tag every command (`.tag`), so a batch can share one login. `!empty` (7.18+) is ignored,
  `!trap` is followed by `!done`, a timeout sends `/cancel`. Logins before 6.43 answer with a challenge
  for an MD5 response.
- The UI calls `POST /hosts/:id/call` and `/batch` (up to 24). `ros/policy.ts` sorts commands by what
  they do rather than listing paths, since WinBox reaches every menu: print is view (secrets blanked
  unless administer, `.hidden` lists them), bounded tools and toggling interfaces are operate, edits
  are configure, admin menus and any argument holding a script are administer, and unknown commands
  are administer. Tools that would run forever must carry their bound (`count`, `duration`, `once`).
  print with `interval`, `follow` or `file` is refused.
- `ssh-routes.ts`: `/exec` (one CLI command), `/export` (`/export terse`, `show-sensitive` on v7,
  `hide-sensitive` on v6) and `/files/download|upload` over SFTP. All administer.
- `mndp.ts`: MNDP on UDP 5678 (a 4-byte request makes routers answer at once), parsed TLVs; needs the
  `network:broadcast` capability and works only in the Termix server's broadcast domain.
- The frontend menu is data: `src/frontend/menus/*.ts` build `TableSpec`, `FormSpec`, `TabsSpec` and
  custom panels with the helpers in `menus/dsl.ts`; `menus/catalog.ts` is WinBox's left menu. Labels
  come from `menu.<id>`, `tab.<id>`, `action.<id>`; property labels from `props.<name>` and else
  `humanize()`. `requires` hides menus a router lacks: version (`v6`, `v7`, `since`) or the optional
  menus probed once per router with `print count-only` (`OPTIONAL_MENUS`).
- `RecordDialog` sends only changed fields on set; empty secrets keep the router's value. Booleans go as
  yes/no, which both protocols take; RouterOS answers true/false.
- Safe changes (`panels/SafeMode.tsx`): `/system backup save name=termix-safe` and a one-shot
  scheduler `termix-safe-rollback` at the router's clock plus N minutes that loads it back. Keep
  removes both. The router's date format is either `2025-10-25` (7.10+) or `oct/25/2025`.
- On v7, `RecordDialog` and `FormView` ask `/console/inspect request=child path=<menu>,add|set`
  (`useArgs` in `views/refs.ts`, cached per router) and drop fields the router doesn't take; v6 has no
  inspect and shows them all. `onlyIfPresent` fields show on edit only when the entry has them (renamed
  properties: `address` → `available-from` on `/ip service`, `always-allow-password-login` →
  `password-authentication` on `/ip ssh`). A `FormSpec` whose print comes back as a list opens as a
  table (OVPN servers, MPLS LDP on later v7).
- Checked live on a CRS326 with RouterOS 7.24.5 over the API and REST (`npm run live`).
- WireGuard client keys are made with WebCrypto X25519 in the browser and never sent anywhere.
- Roadmap: `ROADMAP.md`.
