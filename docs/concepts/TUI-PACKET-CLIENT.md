# ECTLogger TUI/Packet Client Spec Draft (Back-Burner)

Last updated: 2026-06-08

This document is a structured draft spec for a terminal-first ECTLogger client designed for low-bandwidth and degraded-link operations.

## 1. Problem Statement

Web UI workflows assume stable browser access and sufficient bandwidth. Emergency comms operations may require:

- console-only operation
- intermittent or very low-bandwidth links
- packet radio and message-gateway workflows

Goal: provide a resilient terminal client and related gateway patterns that keep essential net operations available when browser-first workflows are impractical.

## 2. Goals and Non-Goals

### Goals

- Provide terminal-based net operations over SSH/local console.
- Support packet-friendly command and response formats.
- Operate with polling and offline queue behavior for unreliable links.
- Integrate with current ECTLogger API for core net workflows.
- Enable future gateway patterns (including Winlink form ingestion).

### Non-Goals (initial release)

- Full parity with the web UI.
- Replacing browser workflows for normal high-bandwidth operation.
- Solving every digital mode integration in first release.

## 3. Scope

### In Scope (phaseable)

- TUI for active net visibility and command-driven control.
- Two command modes:
	- full command mode for direct terminal users
	- abbreviated mode optimized for packet links
- API-backed check-ins, status updates, frequency control, chat, and net close.
- Polling-based updates and basic diff/compressed response patterns.
- Offline command queue + retry/sync behavior.

### Out of Scope for now

- Full cross-platform desktop GUI wrapper.
- Production-grade support for every transport (HF, satellite, all modem stacks) on day one.
- End-to-end Winlink automation in initial phase.

## 4. Operator Personas and Use Cases

- Net Control (NCS) on constrained links:
	- manage check-ins and status without browser dependency
- Field relay operator:
	- submit updates over packet/Winlink gateway path
- Training operator:
	- practice low-bandwidth procedures with realistic command workflows

Primary use cases:

1. Field deployment with a laptop + TNC.
2. Remote check-ins via form/gateway path.
3. HF/low-throughput operation using abbreviated protocol.
4. Backup operations when primary internet path is unavailable.

## 5. Functional Requirements

### 5.1 Terminal UI Behavior

- Show active net metadata (name, status, frequencies).
- Show concise station/check-in table.
- Provide interactive command prompt.
- Refresh state by polling in constrained environments.

Concept UI:

```text
┌─────────────────────────────────────────────────────────────┐
│                    ECTLogger TUI Client                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ NET: LA County ARES Training Net    Status: ACTIVE     ││
│  │ Freq: 147.435+ (Active) | 223.96 | D-STAR REF033C      ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ #  │ CALL    │ NAME      │ STATUS │ FREQ    │ TIME     ││
│  │ 1  │ W6ABC   │ John      │ IN     │ 147.435 │ 19:02    ││
│  │ 2  │ KN6XYZ  │ Maria     │ IN     │ 223.96  │ 19:03    ││
│  │ 3  │ N6TEST  │ Bob       │ LSN    │ 147.435 │ 19:05    ││
│  │ 4  │ K6EMT   │ Sarah     │ TFC    │ D-STAR  │ 19:07    ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ CMD> _                                                  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Full Command Mode (Terminal)

Baseline command set includes:

```text
CMD> ci W6NEW John Pasadena        # Check in W6NEW
CMD> co W6ABC                      # Check out W6ABC
CMD> st W6NEW tfc                  # Set status to "has traffic"
CMD> freq 2                        # Switch active freq to #2
CMD> list                          # Refresh check-in list
CMD> chat Net is moving to 223.96  # Send chat message
CMD> close                         # Close the net
CMD> help                          # Show commands
```

### 5.3 Abbreviated Command Mode (Packet)

For links around 1200 baud and similar constraints:

```text
ECT>C W6NEW,JOHN,PASADENA,IN       # Check in
ECT>OK 5                           # Response: check-in #5
ECT>L                              # List check-ins
ECT>1:W6ABC:JOHN:IN:19:02
ECT>2:KN6XYZ:MARIA:IN:19:03
ECT>3:W6NEW:JOHN:IN:19:08
ECT>END
```

### 5.4 Packet Optimization Requirements

- Compressed/diff updates instead of full-state dumps when possible.
- Abbreviated commands and response tokens.
- Polling model preferred over push/WebSocket in constrained environments.
- Batch command transmission where practical.
- Offline queue with replay on reconnect.

## 6. API Integration Requirements

The client relies on existing endpoints for core operation:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/magic-link/request` | Auth bootstrap (or API key alternative) |
| `GET /api/nets/?status=active` | List active nets |
| `GET /api/nets/{id}` | Get net details |
| `POST /api/check-ins/nets/{id}/check-ins` | Check in station |
| `PUT /api/check-ins/{id}/status` | Update status |
| `PUT /api/nets/{id}/active-frequency` | Change active frequency |
| `POST /api/chat/nets/{id}` | Send chat message |
| `PUT /api/nets/{id}/close` | Close net |

## 7. Authentication and Trust Model (Draft)

Candidate models for constrained and automated environments:

- API key flow as a simpler alternative to short-lived JWT handling.
- Station callsign + pre-shared credential model for trusted operators.
- Gateway identity model where one authenticated node relays for field users.

Open design note: select one primary model for M1 and define rotation/revocation process.

## 8. Winlink Gateway Concept (Future Phase)

Example form payload:

```text
To: ECTLOGGER
Subject: CHECKIN

NET_ID: 42
CALLSIGN: W6ABC
NAME: John
LOCATION: Pasadena
STATUS: IN
```

Gateway behavior (future):

- parse incoming Winlink messages
- validate/normalize fields
- submit equivalent API command(s)
- emit acknowledgment/status reply

## 9. Implementation Options

| Approach | Pros | Cons |
|----------|------|------|
| Python + Rich/Textual | Aligns with backend stack, rapid iteration | Python runtime dependency |
| Go + Bubble Tea | Single binary, fast startup, broad deployment | Separate language/toolchain |
| Rust + Ratatui | Small binary, low resource profile | Higher implementation complexity |
| Shell + curl | Maximum portability | Limited UX and maintainability |

## 10. Milestones (Proposed)

- M0 Discovery/Protocol:
	- finalize command grammar and response format
	- define auth model and threat assumptions
- M1 Basic TUI:
	- read-only active net view
	- basic check-in command
	- SSH/local console support
- M2 Full NCS Control:
	- complete command set for net operations
	- polling refresh and robust error handling
- M3 Packet Integration:
	- abbreviated protocol mode
	- TNC/KISS integration path
	- offline queue and replay
- M4 Winlink Gateway:
	- form template and parser
	- gateway service integration
	- acknowledgment workflow

## 11. Open Questions

- Which auth model should be primary for first production deployment?
- What command subset is mandatory for M1 vs optional later?
- How should conflict resolution work when offline queue replay collides with newer server state?
- What maximum payload and cadence targets should packet mode enforce?
- Should chat be included in abbreviated packet mode or deferred?
- Which transport integrations are officially supported first (packet only vs packet + Winlink)?

## 12. Mission Fit

This concept supports ECTLogger's emergency communications mission by preserving core net operations under degraded connectivity where browser-first workflows are not reliable.

## 13. M0 Decision Record

Status: Draft defaults for implementation kickoff.

### Decision A: Primary Auth Model for M1

- Default: API key authentication for TUI clients.
- Rationale: stable for low-bandwidth and unattended terminal workflows without frequent token refresh.
- Guardrails:
	- per-client key issuance
	- key rotation and revocation support
	- scoped permissions limited to required net operations

### Decision B: Minimum M1 Command Set

- Mandatory commands for M1:
	- `help`
	- `list`
	- `ci` (check in)
	- `co` (check out)
	- `st` (set status)
- Deferred to M2+:
	- `freq`
	- `chat`
	- `close`

### Decision C: Offline Queue Conflict Resolution Policy

- Policy: append-only command replay with server-authoritative state.
- Replay behavior:
	- preserve original command order and timestamps
	- submit queued commands idempotently where possible
	- if conflict detected, mark command as rejected and continue replay
- Operator feedback:
	- show per-command result (applied/rejected)
	- provide explicit reason for rejected operations
	- allow manual retry or corrective command entry
