import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerRoutes } from "./routes.js";
import { registerSshRoutes } from "./ssh-routes.js";
import { registerDiscovery } from "./mndp.js";
import { registerSessionPool } from "./ros/connection.js";

export async function activate(ctx: PluginContext) {
  registerSessionPool(ctx);
  const router = ctx.http.router<Router>();
  registerRoutes(ctx, router);
  // The CLI and files go through the router's own SSH server.
  registerSshRoutes(ctx, router);
  registerDiscovery(ctx, router);
  ctx.log.info("RouterOS routes mounted at /plugin-api/mikrotik");
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
