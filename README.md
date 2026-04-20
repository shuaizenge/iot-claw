# iot-claw

`iot-claw` is an IoT control plane for the agent era.

It is not just a device dashboard and not just an MQTT ingestion service. Its goal is to let constrained connected devices join a host-side control plane through stable protocols and become terminal nodes in agent-driven systems.

In `iot-claw`:

- humans express goals instead of clicking through device workflows
- agents handle understanding, orchestration, and coordination
- `iot-claw` provides protocol boundaries, policy, audit, and control-plane safety
- devices sense and act on the real world

Read the project philosophy in `doc/manifesto.md`.

## Core ideas

- most connected devices will gradually become terminal nodes in agent systems
- not every device should run a full agent runtime such as `openclaw`
- the practical path is lightweight devices plus a host-side control plane plus agent orchestration
- devices should expose capabilities, not only data
- as agents become stronger, command boundaries, approvals, and audit trails matter more

## Common use cases

- ingest sensors, edge gateways, relay modules, and controllers through MQTT
- maintain one control path for state, alerts, telemetry, commands, and audits
- let `openclaw` invoke device capabilities through a native plugin or the bridge layer
- add command grading, approvals, and run history for higher-risk actions
- provide a stable host-side entrypoint for agent-driven hardware operations

## Two audiences

### End users

The intended end-user experience for `iot-claw` is direct installation through npm, without requiring people to study the repository or manually assemble a development environment.

In other words, end users should mainly care about:

- install
- configure
- start
- connect devices
- use control-plane capabilities

Useful entry points:

- `doc/guide/quick-start.md` - quick start
- `doc/guide/user-guide.md` - user guide
- `doc/guide/api.md` - HTTP API reference

### Developers

Developers use the repository locally: install dependencies, boot infra, run the service, debug bridges, and test changes.

The recommended developer path is:

1. read `doc/manifesto.md` for the project's direction and boundaries
2. read `doc/guide/architecture.md` for the main flow and module roles
3. use `doc/guide/developer-guide.md` for config, development workflow, and bridge integration
4. use `doc/guide/testing.md` for local verification and integration testing

## Quick start in this repository

1. Install dependencies: `npm install`
2. Copy env file: `cp .env.example .env`
3. Start local infra: `npm run infra:up`
4. Start the service: `npm run dev`
5. Start the MQTT simulation client: `npm run test:mqtt-connect`

Important: `MQTT_TOPIC_FILTER` must be written as `"iot/+/+/+/#"` in `.env`, otherwise `#` is treated as a comment.

Common commands:

```bash
npm run dev
npm run build
npm run typecheck
npm run infra:up
npm run infra:logs
npm run infra:down
npm run test:mqtt-connect
```

## Detailed docs

- `doc/guide/README.md` - guide index
- `doc/guide/quick-start.md` - quick start
- `doc/guide/user-guide.md` - user-facing guide
- `doc/guide/developer-guide.md` - developer guide
- `doc/guide/architecture.md` - architecture guide
- `doc/guide/testing.md` - testing and integration guide
- `doc/guide/api.md` - HTTP API guide

## Current status

- current `package.json` version: `0.0.5`
- the project is evolving from a device ingestion layer into an agent-driven control plane
- the intended end-user shape is install-and-run through npm
- the default recommended agent integration target is currently `openclaw`
