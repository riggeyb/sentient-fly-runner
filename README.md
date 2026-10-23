# Sentient Fly Runner

This public repository is a thin, disposable operator adapter for bounded access from GitHub Actions to the existing Sentient MCP running on Fly.

It contains **no Sentient source code** and **no MCP server source code**. The authoritative Sentient and MCP implementations remain in private repositories. This runner does not build, deploy, or mutate those repositories directly.

Execution path:

`GitHub Actions -> https://sentient-ops-mcp.fly.dev/mcp -> Sentient -> existing Governor / Fly EngineeringJobs`

No secrets belong in this repository. The workflow expects the existing `MCP_CLIENT_TOKEN` to be configured only as a repository Actions secret.

Supported manual operations:

- `health`
- `tools_list`
- `fly_machines_list`
- `fly_machine_get`
- `engineering_create`
- `engineering_get`

The workflow is manual-only (`workflow_dispatch`), uses a standard `ubuntu-latest` runner, and grants the workflow token read-only repository contents permission.
