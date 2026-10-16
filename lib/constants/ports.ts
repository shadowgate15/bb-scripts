/**
 * One id per port-rpc service. `defineChannel` derives a service's whole port
 * range from its id, so unique ids here guarantee no two services overlap.
 * Append new members; don't reorder, or running servers and clients disagree.
 */
export enum PORTS {
  SERVER_LIST,
  ROOTER,
  RUNNER,
}
