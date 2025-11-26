# ECTLogger TUI/Packet Radio Client

> **Status:** Concept / Stretch Goal  
> **Purpose:** Terminal-based client for low-bandwidth and packet radio operations

## Overview

A terminal-based client that communicates with the ECTLogger API, designed to work over:
- **Direct terminal** (SSH, local console)
- **Packet radio** (via TNC/terminal node controller)
- **Winlink** (as a form-based message exchange)
- **Low-bandwidth links** (HF digital modes, satellite)

This would enable net control operations in austere environments where web browsers aren't available or bandwidth is extremely limited.

## User Interface Concept

```
┌─────────────────────────────────────────────────────────────┐
│                    ECTLogger TUI Client                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ NET: LA County ARES Training Net    Status: ACTIVE      ││
│  │ Freq: 147.435+ (Active) | 223.96 | D-STAR REF033C       ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ #  │ CALL    │ NAME      │ STATUS │ FREQ    │ TIME     ││
│  │ 1  │ W6ABC   │ John      │ ✓ IN   │ 147.435 │ 19:02    ││
│  │ 2  │ KN6XYZ  │ Maria     │ ✓ IN   │ 223.96  │ 19:03    ││
│  │ 3  │ N6TEST  │ Bob       │ 👂 LSN │ 147.435 │ 19:05    ││
│  │ 4  │ K6EMT   │ Sarah     │ 🚨 TFC │ D-STAR  │ 19:07    ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ CMD> _                                                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Command Interface

### Full Commands (Terminal Mode)

```
CMD> ci W6NEW John Pasadena        # Check in W6NEW
CMD> co W6ABC                       # Check out W6ABC
CMD> st W6NEW tfc                   # Set status to "has traffic"
CMD> freq 2                         # Switch active freq to #2
CMD> list                           # Refresh check-in list
CMD> chat Net is moving to 223.96   # Send chat message
CMD> close                          # Close the net
CMD> help                           # Show commands
```

### Abbreviated Commands (Packet Mode)

For packet radio where bandwidth is ~1200 baud:

```
ECT>C W6NEW,JOHN,PASADENA,IN       # Check in
ECT>OK 5                            # Response: check-in #5
ECT>L                               # List check-ins
ECT>1:W6ABC:JOHN:IN:19:02
ECT>2:KN6XYZ:MARIA:IN:19:03
ECT>3:W6NEW:JOHN:IN:19:08
ECT>END
```

## Packet Radio Optimizations

- **Compressed updates** - Only send diffs, not full state
- **Abbreviated commands** - `C W6NEW J PASA` instead of full text
- **Polling mode** - Client requests updates vs WebSocket push
- **Message batching** - Queue multiple check-ins, send in one burst
- **Offline queuing** - Store commands when link is down, sync when connected

## Tech Stack Options

| Approach | Pros | Cons |
|----------|------|------|
| **Python + Rich/Textual** | Matches backend, easy API integration | Requires Python runtime |
| **Go + Bubble Tea** | Single binary, fast, works everywhere | Separate codebase |
| **Rust + Ratatui** | Tiny binary, ultra-low resource | Steeper learning curve |
| **Pure shell + curl** | Works on anything with bash | Limited UI, tedious |

## API Endpoints (Already Available)

The existing ECTLogger API supports everything needed:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/magic-link/request` | Auth (or add API key support) |
| `GET /api/nets/?status=active` | List active nets |
| `GET /api/nets/{id}` | Get net details |
| `POST /api/check-ins/nets/{id}/check-ins` | Check in station |
| `PUT /api/check-ins/{id}/status` | Update status |
| `PUT /api/nets/{id}/active-frequency` | Change active freq |
| `POST /api/chat/nets/{id}` | Send chat message |
| `PUT /api/nets/{id}/close` | Close net |

## Authentication Considerations

For automated/packet systems, consider:
- **API keys** instead of JWT tokens (simpler for automated systems)
- **Station callsign auth** - Trusted callsigns with pre-shared keys
- **Gateway mode** - One authenticated station relays for others

## Winlink Integration

Could work as a Winlink form-based message:

```
To: ECTLOGGER
Subject: CHECKIN

NET_ID: 42
CALLSIGN: W6ABC
NAME: John
LOCATION: Pasadena
STATUS: IN
```

A gateway service would parse incoming Winlink messages and submit to the API.

## Use Cases

1. **Field deployment** - NCS runs TUI on laptop connected via packet
2. **Remote check-ins** - Field stations send check-ins via Winlink
3. **HF operations** - Low-bandwidth HF digital modes (JS8Call, Winlink)
4. **Backup capability** - When internet is down, packet network still works
5. **Training** - Practice packet operations with real-world application

## Implementation Phases

### Phase 1: Basic TUI
- Read-only net view
- Simple check-in command
- Works over SSH

### Phase 2: Full NCS Control
- All net management commands
- Real-time updates via polling
- Status changes and frequency control

### Phase 3: Packet Integration
- Abbreviated command protocol
- TNC integration (KISS protocol)
- Offline queue and sync

### Phase 4: Winlink Gateway
- Form template for check-ins
- Gateway service to process messages
- Reply messages with net status

---

*This concept supports ECTLogger's mission of serving emergency communications where traditional internet connectivity may not be available.*
