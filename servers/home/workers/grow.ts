// One-shot worker: keep free of imports so its RAM cost stays minimal.
export async function main(ns: NS) {
  await ns.grow(String(ns.args[0]))
}
