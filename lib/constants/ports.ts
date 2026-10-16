/**
 * One id per port-rpc service. `defineChannel` derives a service's whole port
 * range from its id, so unique ids here guarantee no two services overlap.
 * Append new members; don't reorder, or running servers and clients disagree.
 */
export enum PORTS {
  /** Retired: its scan moved into NETWORK. Kept so later ids don't shift. */
  SERVER_LIST,
  NETWORK,
  RUNNER,
  RAM_POOL,
  TARGET,
  HOME_UPGRADE,
}
