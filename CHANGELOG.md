# Changelog

## 0.1.0

### Added

- A MikroTik tool in the sidebar once a host is marked as a RouterOS router, with every router in one tree and WinBox's menu under each
- Connect through the API over the host's SSH tunnel (RouterOS v6 and v7), REST over the tunnel, REST directly or the API directly on port 8728 or 8729
- Dashboard with CPU, memory, storage, health, identity and traffic charts
- Interfaces with live traffic, Ethernet, VLAN, bonding, EoIP, GRE, IPIP, 6to4, VXLAN, VRRP, MACVLAN, VETH, LTE and interface lists
- Bridge with ports, VLANs, MSTIs, filters, NAT, hosts and MDB, and the switch chip menus
- IP: addresses, routes, pools, ARP, DHCP client, server and relay, DNS, firewall, hotspot, IPsec, neighbors, services, settings, cloud, UPnP, web proxy, SOCKS, SMB, SNMP, SSH, TFTP and traffic flow
- IPv6: addresses, routes, pools, DHCP, firewall, ND, neighbors and settings
- Wireless, WiFi (and wifiwave2) and CAPsMAN for both wireless packages
- PPP: PPPoE, L2TP, SSTP, OpenVPN and PPTP clients and servers, secrets, profiles and active connections
- WireGuard with a New client that makes the client's keys in the browser and shows its config with a QR code
- Routing: BGP, OSPF, RIP, filters, BFD, router IDs and tables for v7, and BGP, OSPF, RIP, filters and BFD for v6
- System: identity, clock, NTP, users and groups, scheduler, scripts, certificates, logging, LEDs, health, resources, RouterBOARD, watchdog and more
- Queues, RADIUS, Container and User Manager
- Packages and updates with RouterBOARD firmware upgrades; reboot, shutdown and reset
- Files with backup, restore, export and upload over SFTP
- Log, ping, traceroute, torch, IP scan, Wake on LAN, bandwidth test and profile
- New Terminal and single CLI commands over SSH
- Any Menu for menus without a panel of their own
- Find routers on the network with MNDP and add them as hosts
- Safe changes that roll back unless you confirm them
- On RouterOS v7, forms show only the fields the router's version takes, from its own /console/inspect; settings that became lists in later versions open as lists
