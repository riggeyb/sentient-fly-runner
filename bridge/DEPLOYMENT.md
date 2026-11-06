# Sentient GPT Action Bridge V1 — deployment boundary

Status: candidate only. Live Fly deployment is not authorized by this mission.

## Existing authoritative path

The accepted Sentient source contains the live Fly-facing MCP service at:

- repository: `riggeyb/sentient`
- component: `.fly-now/priority1-mcp`
- Fly app: `sentient-ops-mcp`
- MCP endpoint: `https://sentient-ops-mcp.fly.dev/mcp`
- authoritative health tool: `sentient.health`

The temporary Action bridge belongs in `riggeyb/sentient-fly-runner` because it is an operator transport client of the existing MCP service. It does not change Sentient, Governor, Director, or MCP authority semantics.

## Runtime

Run:

```text
node bridge/server.mjs
```

No third-party runtime dependencies are required.

Required server-side secrets:

- `GPT_ACTION_BRIDGE_TOKEN` — dedicated external Bearer credential used only by the GPT Action.
- `MCP_CLIENT_TOKEN` — existing internal MCP credential used only by the bridge when calling the existing MCP endpoint.

Optional configuration:

- `PORT` — defaults to `8080`.

The bridge fails closed if either secret is missing or if the two credentials are equal.

Neither secret belongs in source control, OpenAPI examples, GPT instructions, logs, or conversations.

## GPT Apps / Actions conflict check

The current runtime cannot inspect the existing Sentient GPT editor configuration. Therefore whether the GPT currently depends on Apps is **UNKNOWN_NOT_OBSERVABLE_FROM_CURRENT_RUNTIME**.

Before enabling an Action, the human must inspect the existing Sentient GPT configuration. If Apps are enabled or required, stop and reconcile that product constraint before changing the GPT. This candidate does not alter GPT configuration.

## GPT Action configuration after separate deployment authorization

1. Deploy this candidate as a separate Fly HTTP service or equivalent existing authorized non-production target.
2. Set the two server-side secrets above. Keep them logically distinct.
3. Replace the placeholder server URL in `bridge/openapi.json` with the deployed bridge origin.
4. In the existing Sentient GPT editor, configure Action authentication as API key / Bearer and enter only the dedicated external Action credential.
5. Import the OpenAPI document.
6. Test only `checkSentientHealth`.
7. Confirm the response came through `sentient.health` and that no additional Action capability is exposed.

The runtime request path is:

`Existing Sentient GPT -> GPT Action -> bridge GET /operator/health -> existing Sentient MCP -> sentient.health -> authoritative Sentient target`

GitHub Actions are not required at runtime.

## Deployment delta

A later authorized deployment needs only:

- one thin Node HTTP process from this candidate;
- two Fly secrets;
- one public HTTPS origin for the bridge;
- the OpenAPI server URL updated to that origin;
- the existing Sentient GPT Action configured with the dedicated external Bearer credential.

No change to canonical Sentient, Governor, Director, Gate 2, provider configuration, model configuration, or the existing MCP tool surface is required.

## Rollback

If the temporary bridge must be removed:

1. Disable/remove the Action from the existing Sentient GPT.
2. Stop or remove the temporary bridge service, or roll it back to its pre-bridge deployment.
3. Delete/rotate the dedicated `GPT_ACTION_BRIDGE_TOKEN`.
4. Remove `MCP_CLIENT_TOKEN` from the temporary bridge service secret set.
5. Verify the existing `sentient-ops-mcp` and authoritative Sentient health paths remain unchanged.

Rollback does not require changing canonical Sentient because this candidate does not modify it.
