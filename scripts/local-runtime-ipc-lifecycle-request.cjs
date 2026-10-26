const request = {
  repo: "riggeyb/sentient",
  branch: "sentient-production-composition-20261017",
  expectedHead: "fdab101aeef2275a3f9333384d6e8445799366a3",
  expectedTree: "c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e",
  objectiveId: "SENTIENT_ROUTINE_LOCAL_RUNTIME_IPC_LIFECYCLE_RELIABILITY_V1",
  actionId: "local-runtime-ipc-lifecycle-v1",
  authorizedPaths: ["src/local-runtime/supervisor.ts"],
  authorizationIdentity: "sentient:objective:SENTIENT_ROUTINE_LOCAL_RUNTIME_IPC_LIFECYCLE_RELIABILITY_V1",
  authorizationReason: "Routine bounded reliability repair for a verified supervisor-fatal transport disconnect. Handle socket error/close lifecycle without suppressing store, policy, or crash-boundary errors. No timeout change, deployment, resource change, paid compute, learning, or certification mutation.",
  policyVersion: "sentient-capability-tier/v1",
  idempotencyKey: "local-runtime-ipc-lifecycle-fdab101a-v1",
  objective: "Prevent worker socket disconnect/EPIPE from terminating the LSR supervisor. Add transport-level socket error handling in supervisor.accept that forgets only the stale socket and destroys it, preserving all authoritative store/policy errors and existing crash boundaries. Validate build, diff, and three consecutive complete local-runtime test runs. No deployment.",
  commands: [
    {name:"install",category:"build",command:"npm",args:["ci","--ignore-scripts","--no-audit","--no-fund"],timeoutMs:240000},
    {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:240000},
    {name:"edit-supervisor-socket-lifecycle",category:"edit",command:"node",args:["-e","\nconst fs=require(\"node:fs\");\nconst p=\"src/local-runtime/supervisor.ts\";\nlet s=fs.readFileSync(p,\"utf8\");\nconst start='  private accept(socket: Socket): void {\\n    readJsonLines(';\nconst insert='  private accept(socket: Socket): void {\\n    const forgetSocket = (): void => {\\n      const sentientId = this.socketIdentity.get(socket);\\n      if (sentientId !== undefined && this.sockets.get(sentientId) === socket) {\\n        this.sockets.delete(sentientId);\\n      }\\n    };\\n    socket.on(\"error\", () => {\\n      forgetSocket();\\n      socket.destroy();\\n    });\\n    readJsonLines(';\nconst n=s.split(start).length-1;\nif(n!==1)throw new Error(\"accept_anchor_count:\"+n);\ns=s.replace(start,insert);\nconst close='    socket.on(\"close\", () => {\\n      const sentientId = this.socketIdentity.get(socket);\\n      if (sentientId !== undefined && this.sockets.get(sentientId) === socket) {\\n        this.sockets.delete(sentientId);\\n      }\\n    });';\nconst repl='    socket.on(\"close\", forgetSocket);';\nconst m=s.split(close).length-1;\nif(m!==1) throw new Error(\"close_anchor_count:\"+m);\ns=s.replace(close,repl);\nfs.writeFileSync(p,s);\n"]," timeoutMs":30000},
    {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeotMs:240000},
    {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
    {name:"focused-local-runtime-x3",category:"test",command:"node","args":["-e","\nconst {spawnSync}=require(\"node:child_process\");\nfor(let i=1;i<=3;i++){\n  const r=spawnSync(process.execPath,[\"--test\",\"dist/test/local-runtime.test.js\"],{encoding:\"utf8\",timeout:180000,maxBuffer:4*1024*1024,env:process.env});\n  if(r.status!==0||r.error){\n    process.stdout.write((r.stdout||\"\").slice(-12000));\n    process.stderr.write((r.stderr||\"\").slice(-12000));\n    throw new Error(\"focused_local_runtime_iteration_failed:\"+i+\":\"+(h.error?.message||r.status));\n  }\n  console.log(\"FOCUSED_LOCAL_RUNTIME_ITERATION_\"+i+\"=PASS\");\n}\n"],"timeotMs":600000}
  ],
  commitMessage: "fix: fence local runtime socket disconnects",
  timeoutMs: 1800000
};
process.stdout.write(JSON.stringify(request));
