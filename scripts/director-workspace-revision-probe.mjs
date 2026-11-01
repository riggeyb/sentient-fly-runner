// Real-SQL acceptance probe for Director projectViewRevision/projectView.
// Runs from the operator checkout against the exact Director checkout (DIRECTOR_DIR)
// and an ephemeral local Postgres only. Writes a JSON result file and never throws
// without recording BLOCKED/FAIL for the affected checks.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.resolve(process.env.DIRECTOR_DIR || ".");
const out = process.env.PROBE_OUT || "probe-result.json";
const dbUrl = process.env.DATABASE_URL || "";
if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl)) {
  console.error("REFUSING: DATABASE_URL is not a local Postgres URL");
  process.exit(2);
}
const checks = [
  "REAL_SQL_REVISION_QUERY",
  "REQUOTED_TERMS_INVALIDATION",
  "LARGE_JSON_INVALIDATION",
  "WALLET_RESERVATION_INVALIDATION",
  "HEARTBEAT_REVISION_INSENSITIVE",
  "OWNER_AUTH_BOUNDARY_SQL",
];
const result = Object.fromEntries(checks.map((c) => [c, "BLOCKED"]));
const notes = {};
const mark = (k, ok, note) => {
  result[k] = ok ? "PASS" : "FAIL";
  if (note) notes[k] = note;
};
const block = (k, e) => {
  result[k] = "BLOCKED";
  notes[k] = String(e && e.message ? e.message : e).slice(0, 500);
};
const uid = () => `acc-${crypto.randomBytes(8).toString("hex")}`;
const HEX32 = /^[0-9a-f]{32}$/;

const req = createRequire(path.join(dir, "package.json"));
const { Prisma, PrismaClient } = req("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: dbUrl });
const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const enums = Object.fromEntries(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));
const delegate = (name) => prisma[name.charAt(0).toLowerCase() + name.slice(1)];

function fill(model, overrides) {
  const data = { ...overrides };
  for (const f of model.fields) {
    if (f.kind === "object" || f.name in data || f.hasDefaultValue || !f.isRequired || f.isList) continue;
    if (f.kind === "enum") data[f.name] = enums[f.type][0];
    else if (f.type === "String") data[f.name] = uid();
    else if (f.type === "Int" || f.type === "Float") data[f.name] = 0;
    else if (f.type === "BigInt") data[f.name] = 0n;
    else if (f.type === "Decimal") data[f.name] = 0;
    else if (f.type === "Boolean") data[f.name] = false;
    else if (f.type === "DateTime") data[f.name] = new Date();
    else if (f.type === "Json") data[f.name] = {};
  }
  return data;
}
const create = (name, overrides) => delegate(name).create({ data: fill(models[name], overrides) });
const has = (name, field) => Boolean(models[name]?.fields.some((f) => f.name === field));
const field = (name, f) => models[name].fields.find((x) => x.name === f);
const jsonVal = (f, tag) => (f.type === "Json" ? { probe: tag } : tag);

let projectId, ownerId, mod, revision;

try {
  mod = await import(pathToFileURL(path.join(dir, "lib/projects.ts")).href);
  if (typeof mod.projectViewRevision !== "function" || typeof mod.projectView !== "function") {
    throw new Error("projectViewRevision/projectView not exported by lib/projects.ts");
  }
  for (const m of ["DirectorProject", "DirectorOrder", "DirectorJob", "DirectorCreditReservation"]) {
    if (!models[m]) throw new Error(`exact schema model ${m} missing`);
  }
  revision = () => mod.projectViewRevision(projectId, ownerId);

  // Ownership is the scalar DirectorProject.ownerId; there is no owner table.
  ownerId = uid();
  projectId = uid();
  const ids = { projectId, ownerId };
  const fk = (m) => {
    const o = {};
    for (const n of ["ownerId", "projectId", "orderId", "jobId"]) if (has(m, n) && ids[n]) o[n] = ids[n];
    return o;
  };
  await create("DirectorProject", { id: projectId, ownerId });
  const order = await create("DirectorOrder", fk("DirectorOrder"));
  ids.orderId = order.id;
  const job = await create("DirectorJob", fk("DirectorJob"));
  ids.jobId = job.id;
  const reservation = await create("DirectorCreditReservation", fk("DirectorCreditReservation"));

  const t1 = await revision();
  if (typeof t1 !== "string" || !HEX32.test(t1)) throw new Error(`token not 32 hex: ${String(t1)}`);
  const t1b = await revision();
  const view1 = await mod.projectView(projectId, ownerId);
  if (!view1) throw new Error("projectView returned nothing for owner");
  mark("REAL_SQL_REVISION_QUERY", t1 === t1b, t1 === t1b ? "stable on repeat" : "token unstable without mutation");

  // Requote: change latest order terms only
  try {
    const tag = `requote-${uid()}`;
    const base = await revision();
    await prisma.directorOrder.update({ where: { id: order.id }, data: { terms: jsonVal(field("DirectorOrder", "terms"), tag) } });
    const t2 = await revision();
    const exposed = JSON.stringify(await mod.projectView(projectId, ownerId)).includes(tag);
    mark("REQUOTED_TERMS_INVALIDATION", t2 !== base && exposed, `tokenChanged=${t2 !== base} termsExposed=${exposed}`);
  } catch (e) { block("REQUOTED_TERMS_INVALIDATION", e); }

  // Large JSON rendered field: DirectorJob.planningState
  try {
    const base = await revision();
    const tag = uid();
    await prisma.directorJob.update({ where: { id: job.id }, data: { planningState: { big: "x".repeat(20000), tag } } });
    const after = await revision();
    const exposed = JSON.stringify(await mod.projectView(projectId, ownerId)).includes(tag);
    mark("LARGE_JSON_INVALIDATION", after !== base && exposed, `tokenChanged=${after !== base} planningStateExposed=${exposed}`);
  } catch (e) { block("LARGE_JSON_INVALIDATION", e); }

  // Wallet / reservation metadata
  try {
    const base = await revision();
    await prisma.directorCreditReservation.update({ where: { id: reservation.id }, data: { metadata: { probe: uid() } } });
    const after = await revision();
    mark("WALLET_RESERVATION_INVALIDATION", after !== base, `tokenChanged=${after !== base}`);
  } catch (e) { block("WALLET_RESERVATION_INVALIDATION", e); }

  // Heartbeat only
  try {
    const base = await revision();
    await prisma.directorJob.update({ where: { id: job.id }, data: { heartbeatAt: new Date(Date.now() + 60000) } });
    const after = await revision();
    mark("HEARTBEAT_REVISION_INSENSITIVE", after === base, `unchanged=${after === base}`);
  } catch (e) { block("HEARTBEAT_REVISION_INSENSITIVE", e); }

  // Wrong owner: a different random ownerId string
  try {
    let leaked;
    try { leaked = await mod.projectViewRevision(projectId, uid()); } catch { leaked = null; }
    mark("OWNER_AUTH_BOUNDARY_SQL", !(typeof leaked === "string" && HEX32.test(leaked)), "wrong owner receives no token");
  } catch (e) { block("OWNER_AUTH_BOUNDARY_SQL", e); }
} catch (e) {
  for (const k of checks) if (result[k] === "BLOCKED" && !notes[k]) block(k, e);
}

writeFileSync(out, JSON.stringify({ result, notes }, null, 2));
console.log(JSON.stringify({ result, notes }, null, 2));
await prisma.$disconnect();
process.exit(0);
