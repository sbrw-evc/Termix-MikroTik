MikroTik RouterOS configures MikroTik routers from Termix the way WinBox does: every router in one tree with WinBox's menu under it, each menu a live list or form you can change. It works with RouterOS v6 and v7.

## Add a router

1. Add the router as an SSH host, or open one you have. Find routers finds routers on the Termix server's network and adds them for you.
2. In the host's settings, find MikroTik router and turn it on.
3. Pick how Termix reaches the router under Connect through:
   - Automatic: the API over an SSH tunnel.
   - API over SSH tunnel: the RouterOS API on port 8728 (8729 with API over TLS), reached through the host's SSH connection. Works on v6 and v7, no certificate needed, and the API port does not have to be open to the network. The router must allow SSH forwarding: `/ip ssh set forwarding-enabled=local` on v7, `forwarding-enabled=yes` on v6.
   - REST over SSH tunnel: RouterOS v7's REST API through the same tunnel, on the www service (port 80) or www-ssl.
   - REST API directly: HTTPS to the router's www-ssl service, RouterOS 7.1 or newer. Paste the CA that signed the router's certificate into CA certificate.
   - API directly: TCP to port 8728, or 8729 with API over TLS and the router's CA. Without TLS the password crosses the network in the clear, so use it only on a network you trust.
4. RouterOS user and RouterOS password are the login Termix uses. Left empty, it uses the host's SSH username and password. A user of its own for Termix, in a group with just the policies you need, is best.
5. Save.

MikroTik now shows under Tools in the sidebar. It stays hidden until at least one host is a MikroTik router.

## Use it

Open MikroTik from Tools, or right-click a router in the host list and pick Open in MikroTik. While the tab is on screen, the routers and their menus sit in the left sidebar; the tab shows what you pick. Menus a router doesn't have, like Wireless on a router without radios or v7's routing on v6, are left out.

- Dashboard: CPU, memory and storage, health, identity, board, version, uptime, firmware and clock, with charts of CPU, memory and one interface's traffic, and the interfaces and addresses.
- Lists work like WinBox's: click to select, Ctrl or Shift for several, double-click to edit. Add, Edit, Remove, Enable, Disable, Comment and, where order matters, Move up and Move down. Filter searches every column. Lists refresh by themselves. The first column has RouterOS's flags: X disabled, I invalid, D dynamic, R running, S slave.
- A dialog shows the properties the menu usually needs, More properties for the rest of what the entry has, More arguments for anything else as `name=value` lines, and Status for what RouterOS keeps itself.
- Settings menus, like DNS or Clock, are one form with Apply.
- Safe changes, at the top right, saves a backup on the router and schedules loading it back in a few minutes. Keep changes cancels the rollback. If a change cuts the router off, it rolls itself back and reboots. WinBox's own Safe Mode needs a WinBox session, which the API does not have.

The menus follow WinBox: CAPsMAN, Interfaces (with Ethernet, VLAN, bonding, tunnels, VXLAN, VRRP, LTE and interface lists), WireGuard, WiFi and Wireless, Bridge (ports, VLANs, MSTIs, filters, NAT, hosts), PPP (clients, servers, secrets, profiles, active), Switch, IP, IPv6, MPLS, Routing (BGP, OSPF, RIP, filters, BFD, tables for v7; their v6 counterparts), System, Queues, Files, Log, RADIUS, Tools, Container and User Manager.

- Interfaces shows each interface's live Tx and Rx.
- WireGuard has New client: Termix makes the client's keys in your browser, adds the peer and shows the client's config with a QR code. The private key is never stored.
- Packages and Updates checks for updates on a channel, downloads and installs them, lists packages and upgrades RouterBOARD firmware.
- Files lists the router's files. Backup saves a .backup, Restore loads one, Export downloads the configuration as a script (with or without secrets), Upload puts a file on the router, Download fetches the one selected. These go over SFTP and SSH.
- Log shows the router's log and follows it.
- Tools: Ping, Traceroute, Torch, IP Scan, Wake on LAN, Bandwidth Test and Profile, with Netwatch, Graphing, MAC server, RoMON and the rest as lists.
- New Terminal opens the router's CLI in a Termix terminal tab, and runs single commands in place.
- Reboot and Reset reboots, shuts down or resets the configuration after you type the router's identity.
- Any Menu opens any menu by its path, like `ip/firewall/filter`, as a list with add, edit and remove. On v7 it lists the menus under a path. Administrators can run any command in it.

## Find routers

Find routers, at the top of the tab, asks with MNDP, the protocol WinBox's Neighbors list uses, and lists the routers that answer: identity, address, MAC, version, board and interface. Add as host makes an SSH host for one, in the MikroTik folder, with MikroTik turned on; add its login in the host editor. Only routers in the Termix server's own broadcast domain answer, so a Termix in Docker needs host networking for this.

## Permissions

- View MikroTik routers: every menu, read only. Passwords, keys and secrets are left out of what it shows.
- Operate MikroTik routers: ping, traceroute, torch, scans, Wake on LAN, turning interfaces on and off, renewing DHCP, flushing caches and dropping sessions and connections.
- Configure MikroTik routers: add, change, remove, enable, disable and move entries.
- Administer MikroTik routers: users, packages and updates, scripts, the scheduler, files, backups and restore, services and SSH settings, certificates, containers, the CLI and exports, reboot, shutdown and reset, and anything that holds a script (an on-event, an up-script). Also sees secrets.

Anything beyond viewing also needs edit access to the Termix host. Every change is written to the audit log. RouterOS's own policies for the RouterOS user still apply on top.

## Troubleshooting

- The router does not allow SSH port forwarding: run `/ip ssh set forwarding-enabled=local` (v7) or `forwarding-enabled=yes` (v6), or pick REST or API directly.
- RouterOS refused the username or password: check RouterOS user and password, or the host's SSH login if those are empty, and that the user's group has the policies the API or REST needs, such as api, read and write.
- This router has no REST API here: REST needs RouterOS 7.1 or newer with the www or www-ssl service on. Use the API instead.
- Termix does not trust the router's certificate: paste the CA into CA certificate, or use a tunnel.
