// One-shot worker: keep free of imports so its RAM cost stays minimal.
// args: target, optional delay in ms (batches use it to order their landings).
export async function main(ns: NS) {
  await ns.hack(String(ns.args[0]), {
    additionalMsec: Number(ns.args[1] ?? 0),
  })
}
