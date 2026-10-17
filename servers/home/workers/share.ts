// One-shot worker: a single 10 s share cycle. Keep free of imports so its RAM cost stays minimal.
export async function main(ns: NS) {
  await ns.share()
}
