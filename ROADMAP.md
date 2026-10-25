# Roadmap

Each phase is a release, checked on a real router before it ships.

## 0.1: WinBox's menus (this release)

- Connect over the API (v6, v7) or REST (v7), directly or through the host's SSH tunnel
- Every router in one tree; WinBox's menu with the entries each router has
- Interfaces, bridge, IP, IPv6, firewall, wireless, WiFi, CAPsMAN, PPP, WireGuard, routing, system,
  queues, tools, container, files, log, terminal
- MNDP discovery, safe changes, any menu by its path

## Next

- Translations into the languages Termix-PVE has
- Field forms from RouterOS v7's own `/console/inspect` for menus without a curated list
- Torch and the log over a socket instead of polling
- Graphs from `/tool/graphing` in the dashboard

## Out of scope for now

- MAC-WinBox and MAC-Telnet to routers without an IP address: the Termix server would need layer 2
  access to the router's network and its own MAC-Telnet client
- WinBox's own Safe Mode, which needs a WinBox session; Safe changes does the same with a scheduled
  rollback
