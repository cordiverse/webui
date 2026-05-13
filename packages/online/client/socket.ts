/**
 * Re-export of the WS bridge primitive from `@cordisjs/plugin-webui`. Online's
 * server-side and client-side cordis halves run in the same JS realm; the
 * bridge is the only seam between them.
 *
 * Keeping the re-export here means consumers (`bootstrap.ts`, instance UI)
 * import a workspace-local file rather than reaching into the webui plugin's
 * internals — useful if we ever swap the bridge implementation.
 */
export { createSocketBridge } from '@cordisjs/plugin-webui'
export type { BridgeSocket, SocketBridge } from '@cordisjs/plugin-webui'
