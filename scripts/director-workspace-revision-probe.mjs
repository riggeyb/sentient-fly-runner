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

let projectId, ownerId, project, mod, revision;

try {
  const projectsPath = ["lib/projects.ts", "lib/projects.js"].map((p) => path.join(dir, p));
  mod = await import(pathToFileURL(projectsPath[0]).href);
  if (typeof mod.projectViewRevision !== "function" || typeof mod.projectView !== "function") {
    throw new Error("projectViewRevision/projectView not exported by lib/projects.ts");
  }
  revision = () => mod.projectViewRevision(projectId, ownerId);

  const ownerModel = ["User", "Owner", "Account"].find((n) => models[n]);
  if (!ownerModel) throw new Error("no User/Owner/Account model");
  ownerId = uid();
  const owner = await create(ownerModel, { id: ownerId, ...(has(ownerModel, "email") ? { email: `${ownerId}@example.invalid` } : {}) });
  ownerId = owner.id;
  projectId = uid();
  const fk = (m) => {
    const o = {};
    for (const n of ["ownerId", "userId", "createdById"]) if (has(m, n)) o[n] = ownerId;
    if (has(m, "projectId")) o.projectId = projectId;
    return o;
  };
  project = await create("Project", { id: projectId, ...fk("Project") });
  projectId = project.id;
  const order = await create("DirectorOrder", { ...fk("DirectorOrder") });
  const job = has("DirectorJob", "heartbeatAt")
    ? await create("DirectorJob", { ...fk("DirectorJob"), ...(has("DirectorJob", "orderId") ? { orderId: order.id } : {}) })
    : null;
  var seeded = { order, job };

  const t1 = await revision();
  if (typeof t1 !== "string" || !HEX32.test(t1)) throw new Error(`token not 32 hex: ${String(t1)}`);
  const t1b = await revision();
  const view1 = await mod.projectView(projectId, ownerId);
  if (!view1) throw new Error("projectView returned nothing for owner");
  mark("REAL_SQL_REVISION_QUERY", t1 === t1b, t1 === t1b ? "stable on repeat" : "token unstable without mutation");

  // Requote: change latest order terms only
  try {
    if (!has("DirectorOrder", "terms")) throw new Error("DirectorOrder.terms missing");
    const f = field("DirectorOrder", "terms");
    const latest = await delegate("DirectorOrder").findFirst({
      where: fk("DirectorOrder"),
      orderBy: has("DirectorOrder", "createdAt") ? { createdAt: "desc" } : undefined,
    });
    const tag = `requote-${uid()}`;
    const terms = jsonVal(f, tag);
    await delegate("DirectorOrder").update({ where: { id: latest.id }, data: { terms } });
    const t2 = await revision();
    const view2 = await mod.projectView(projectId, ownerId);
    const exposed = JSON.stringify(view2).includes(tag);
    mark("REQUOTED_TERMS_INVALIDATION", t2 !== t1 && exposed, `tokenChanged=${t2 !== t1} termsExposed=${exposed}`);
  } catch (e) { block("REQUOTED_TERMS_INVALIDATION", e); }

  // Large JSON rendered field
  try {
    const before = await revision();
    let target;
    if (has("Project", "planningState") && field("Project", "planningState").type === "Json") {
      target = { model: "Project", where: { id: projectId }, f: "planningState" };
    } else {
      const m = Object.keys(models).find((n) => /Review/.test(n) && has(n, "projectId") && has(n, "payload"));
      if (!m) throw new Error("no planningState/review payload JSON field located");
      const row = await create(m, fk(m));
      target = { model: m, where: { id: row.id }, f: "payload" };
      await revision();
    }
    const base = await revision();
    await delegate(target.model).update({ where: target.where, data: { [target.f]: { big: "x".repeat(20000), n: uid() } } });
    const after = await revision();
    mark("LARGE_JSON_INVALIDATION", after !== base, `field=${target.model}.${target.f} before=${before.slice(0, 8)}`);
  } catch (e) { block("LARGE_JSON_INVALIDATION", e); }

  // Wallet / reservation
  try {
    const m = Object.keys(models).find((n) => /Reservation/.test(n) && has(n, "projectId"));
    if (!m) throw new Error("no project reservation model found");
    const row = await create(m, fk(m));
    const base = await revision();
    const data = has(m, "metadata") ? { metadata: { probe: uid() } } : has(m, "amountCents") ? { amountCents: 12345 } : null;
    if (!data) throw new Error(`no mutable metadata/amountCents on ${m}`);
    await delegate(m).update({ where: { id: row.id }, data });
    const after = await revision();
    mark("WALLET_RESERVATION_INVALIDATION", after !== base, `model=${m}`);
  } catch (e) { block("WALLET_RESERVATION_INVALIDATION", e); }

  // Heartbeat only
  try {
    if (!seeded.job) throw new Error("DirectorJob.heartbeatAt not available");
    const base = await revision();
    await delegate("DirectorJob").update({ where: { id: seeded.job.id }, data: { heartbeatAt: new Date(Date.now() + 60000) } });
    const after = await revision();
    mark("HEARTBEAT_REVISION_INSENSITIVE", after === base, `unchanged=${after === base}`);
  } catch (e) { block("HEARTBEAT_REVISION_INSENSITIVE", e); }

  // Wrong owner
  try {
    const other = await create(ownerModel, { id: uid(), ...(has(ownerModel, "email") ? { email: `${uid()}@example.invalid` } : {}) });
    let leaked;
    try { leaked = await mod.projectViewRevision(projectId, other.id); } catch { leaked = null; }
    mark("OWNER_AUTH_BOUNDARY_SQL", !(typeof leaked === "string" && HEX32.test(leaked)), "wrong owner receives no token");
  } catch (e) { block("OWNER_AUTH_BOUNDARY_SQL", e); }
} catch (e) {
  for (const k of checks) if (result[k] === "BLOCKED" && !notes[k]) block(k, e);
}

writeFileSync(out, JSON.stringify({ result, notes }, null, 2));
console.log(JSON.stringify({ result, notes }, null, 2));
await prisma.$disconnect();
process.exit(0);
