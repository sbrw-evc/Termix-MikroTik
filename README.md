<div align="center">

<img src="https://termix.site/img/logo.svg" width="120" alt="Termix Logo" />

<h1>MikroTik RouterOS</h1>

<p>Configure MikroTik routers from Termix instead of WinBox</p>

</div>

<br />

## Overview

A [Termix](https://github.com/Termix-SSH/Termix) plugin that configures MikroTik RouterOS v6 and v7 routers the way WinBox does. Mark a host as a MikroTik router and a MikroTik tool shows under Tools in the sidebar, with every router in one tree and WinBox's menu under each.

It reaches the router through the RouterOS API over the host's SSH connection, so no API port needs to be open to the network, or through the REST API or the API directly.

<br />

## Features

- Every router in one tree, with the menus it has: Interfaces, WireGuard, WiFi, Wireless, CAPsMAN, Bridge, PPP, Switch, IP, IPv6, MPLS, Routing, System, Queues, Files, Log, RADIUS, Tools, Container and User Manager
- Lists and forms like WinBox's: add, edit, remove, enable, disable, comment and move, live refresh and flags
- Dashboard with CPU, memory, storage, health and traffic charts
- WireGuard clients with their config and a QR code
- Packages and updates, firmware, backups, exports, files
- Log, ping, traceroute, torch, IP scan, Wake on LAN, bandwidth test
- The router's CLI in a terminal tab
- Any menu by its path, for what has no panel of its own
- Find routers on the network with MNDP
- Safe changes that roll back unless you confirm them

See [docs/index.md](docs/index.md).

<br />

## Install

Termix 26.10 or newer.

1. In Termix, open Settings, General and turn on Plugin developer mode.
2. Build the plugin: `npm install && npm run build && npm run pack`.
3. In Plugins, click Install from file and pick `mikrotik-<version>.tmxplug`.

<br />

## License

Apache License 2.0
