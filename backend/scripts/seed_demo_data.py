#!/usr/bin/env python3
"""
Build a throwaway SQLite database full of fictional data, for documentation
screenshot capture only.

WHY THIS EXISTS: beta holds a live copy of production's database -- real
callsigns, real names, real email addresses (see docs/DEVELOPMENT.md
"Refreshing beta's database from production"). A published screenshot taken
against beta would be a privacy incident. This script builds a disposable
database of entirely invented data instead, using the fixed roster documented
in docs/DEVELOPMENT.md under "Documentation site" > "Example callsigns,
names, and organizations" -- every example callsign carries a four-letter
suffix, which the FCC cannot issue, so no screenshot can put words in a real
operator's mouth.

The database this script produces is NEVER deployed anywhere real. It exists
only to be pointed at by a local backend process (port 8100, see
docs/DEVELOPMENT.md) for screenshot capture, then thrown away and rebuilt.
That is also why every seeded user shares the same plaintext password
(DEMO_PASSWORD below) -- there is no security boundary to protect here.

Usage:
    python backend/scripts/seed_demo_data.py [--db backend/demo.db] [--out backend/demo-seed.json]

Schema comes from app.models via SQLAlchemy metadata (Base.metadata.create_all),
never hand-written DDL, so this seed can never drift from the real schema.
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Settings (app/config.py) is a pydantic BaseSettings instantiated once, at
# import time, from environment variables (falling back to backend/.env,
# which does not exist in a fresh checkout of this repo -- and must never be
# created/modified here, see the task this script was written for). Every
# required setting with no default is stubbed here so `import app.*` below
# succeeds without a real .env. EMAIL_ENABLED=false + a loopback SMTP host is
# the same double-guard beta/alpha use (see docs/DEVELOPMENT.md "Email") --
# belt and suspenders against this throwaway instance ever sending real mail.
# ---------------------------------------------------------------------------
os.environ.setdefault("SECRET_KEY", "demo-only-not-a-real-secret")
os.environ.setdefault("SMTP_USER", "demo@example.com")
os.environ.setdefault("SMTP_PASSWORD", "demo-not-a-real-password")
os.environ.setdefault("SMTP_FROM_EMAIL", "demo@example.com")
os.environ.setdefault("SMTP_HOST", "127.0.0.1")
os.environ.setdefault("EMAIL_ENABLED", "false")
# app/database.py turns on verbose SQLAlchemy statement echo when app_env ==
# "development" (its own default) -- not useful here and just noise.
os.environ.setdefault("APP_ENV", "production")

# Same password for every seeded user -- this database is never deployed
# anywhere real, so there is no reason to vary it, and a single known
# password is what makes screenshot capture scriptable.
DEMO_PASSWORD = "DemoNet!2026"

ORG_ARES = "Example County ARES"
ORG_SKYWARN = "Example County SKYWARN"
ORG_CLUB = "Tuesday Evening Club Net"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default="backend/demo.db", help="SQLite file to (re)build from scratch")
    parser.add_argument("--out", default="backend/demo-seed.json", help="Manifest JSON to write")
    return parser.parse_args()


def _field_config(enable_skywarn=False, enable_weather=False, extra_enabled=None):
    """Matches the shape of Net.field_config / NetTemplate.field_config in
    app/models.py, with a couple of fields optionally flipped on."""
    cfg = {
        "name": {"enabled": True, "required": False},
        "location": {"enabled": True, "required": False},
        "skywarn_number": {"enabled": enable_skywarn, "required": False},
        "weather_observation": {"enabled": enable_weather, "required": False},
        "power_source": {"enabled": False, "required": False},
        "power": {"enabled": False, "required": False},
        "feedback": {"enabled": False, "required": False},
        "notes": {"enabled": False, "required": False},
    }
    for name in extra_enabled or ():
        cfg[name] = {"enabled": True, "required": False}
    return json.dumps(cfg)


async def _build(db_path: Path, out_path: Path):
    # Imported here (not at module scope) so DATABASE_URL is already set in
    # the environment by the time app.config/app.database read it.
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.database import Base, engine, AsyncSessionLocal
    import app.models as _models  # noqa: F401 -- registers every table on Base.metadata
    from app.models import (
        User, UserRole, Net, NetStatus, StationStatus, NetTemplate, Frequency,
        NetRole, CheckIn, ChatMessage, ChatReaction, TemplateStaff,
        NCSRotationMember, FormDefinition, Form, TrafficAction, AppSettings,
        FieldDefinition,
    )
    from app.auth import (
        hash_password, generate_totp_secret, encrypt_mfa_secret, current_totp_codes,
    )
    from app.traffic.definitions import upsert_form_definitions
    from app.traffic.log import append_entry
    from app.traffic.promote import compute_promoted_fields
    from app.routers.settings import ensure_builtin_fields

    # ---- schema, from the models, never hand-written DDL ----
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    now = datetime.now(timezone.utc)
    password_hash = hash_password(DEMO_PASSWORD)

    manifest = {
        "password": DEMO_PASSWORD,
        "users": [],
        "nets": [],
        "templates": [],
        "generated_at": now.isoformat(),
    }

    async with AsyncSessionLocal() as db:
        # Builtin form definitions (ICS-213, Radiogram, ...) and builtin
        # check-in field definitions -- the same upserts the real app runs at
        # startup / on first admin visit, reused here so this seed can never
        # drift from what a real instance would have.
        await upsert_form_definitions(db)
        await ensure_builtin_fields(db)

        db.add(AppSettings(id=1))
        await db.commit()

        # =================================================================
        # USERS -- the fixed roster from docs/DEVELOPMENT.md "Documentation
        # site" > "Example callsigns, names, and organizations". Every
        # callsign has a four-letter suffix (unassignable by the FCC), so no
        # screenshot can be mistaken for a real licensee's own words.
        # =================================================================
        roster = [
            # callsign, name, email-local already implied, location, extra kwargs
            dict(callsign="W1PINE", name="Alex Reed", role=UserRole.NCS,
                 location="Bridgton, ME", website_url="https://example.com/w1pine",
                 live_location="FN43ux"),
            dict(callsign="K1COVE", name="Dana Whitfield", role=UserRole.USER,
                 location="Naples, ME"),
            dict(callsign="N1LAKE", name="Marcus Ellery", role=UserRole.USER,
                 location="Windham, ME"),
            dict(callsign="KC1HILL", name="Priya Nandan", role=UserRole.USER,
                 location="Gray, ME", website_url="https://example.com/kc1hill"),
            dict(callsign="W1PORT", name="Joan Alderman", role=UserRole.USER,
                 location="Portland, ME"),
            dict(callsign="N1ROVE", name="Chris Baumann", role=UserRole.USER,
                 location="Mobile - Route 302, Naples, ME", live_location="FN43vt"),
            dict(callsign="K1CAMP", name="Terry Osgood", role=UserRole.USER,
                 location="Freeport, ME", skywarn_number="ME-2044"),
            # Table filler -- plain fictional names, invented for this script.
            dict(callsign="W2FERN", name="Rebecca Sorensen", role=UserRole.USER,
                 location="Casco, ME"),
            dict(callsign="N2OAKS", name="Daniel Ashworth", role=UserRole.USER,
                 location="Bridgton, ME"),
            dict(callsign="K3BASE", name="Michelle Kirkland", role=UserRole.USER,
                 location="Naples, ME"),
            dict(callsign="W1MILL", name="Tom Halloway", role=UserRole.USER,
                 location="Windham, ME"),
            dict(callsign="N1BIRD", name="Sarah Quimby", role=UserRole.USER,
                 location="Gray, ME"),
            # Deliberately checked into nothing, anywhere. A figure of the
            # check-in dialog needs an account that can still open it, and
            # every other roster member is already checked into the active
            # net. Without this, capturing that figure meant checking someone
            # out first, which rewrites the demo database as a side effect of
            # photographing it.
            dict(callsign="N1DUNE", name="Robin Teague", role=UserRole.USER,
                 location="Freeport, ME"),
            # Admin -- see get_admin_user in app/dependencies.py: MFA is
            # mandatory for the ADMIN role, so this account must be seeded
            # with mfa_enabled=True + a real encrypted secret or the admin
            # panel is unreachable no matter what password is used.
            dict(callsign="W1DEMO", name="Sam Whitcomb", role=UserRole.ADMIN,
                 location="Portland, ME"),
        ]

        users = {}
        admin_totp_secret = None
        for entry in roster:
            kwargs = dict(entry)
            callsign = kwargs.pop("callsign")
            is_admin = kwargs.get("role") == UserRole.ADMIN
            user = User(
                email=f"{callsign.lower()}@example.com",
                callsign=callsign,
                is_active=True,
                password_hash=password_hash,
                email_notifications=True,
                # Otherwise the onboarding walkthrough auto-opens over the top
                # of every page the first time each demo account is used, which
                # is exactly when a screenshot is being taken of it.
                walkthrough_seen=True,
                **kwargs,
            )
            if is_admin:
                admin_totp_secret = generate_totp_secret()
                user.mfa_enabled = True
                user.mfa_secret_encrypted = encrypt_mfa_secret(admin_totp_secret)
            db.add(user)
            users[callsign] = user
        await db.commit()
        for user in users.values():
            await db.refresh(user)

        for callsign, user in users.items():
            manifest["users"].append({
                "callsign": callsign,
                "name": user.name,
                "email": user.email,
                "role": user.role.value,
            })

        # =================================================================
        # FREQUENCIES -- shared list, shows up in the admin frequency table.
        # =================================================================
        f_repeater = Frequency(frequency="146.940", mode="FM", description="Example County ARES Repeater (PL 100.0)")
        f_simplex = Frequency(frequency="146.520", mode="FM", description="2m Simplex Calling/Backup")
        f_dmr = Frequency(mode="DMR", network="Brandmeister", talkgroup="31234", description="Example County DMR Talkgroup")
        f_skywarn = Frequency(frequency="146.850", mode="FM", description="Example County SKYWARN Repeater")
        f_hf = Frequency(frequency="3.930", mode="LSB", description="Example County ARES HF Net")
        db.add_all([f_repeater, f_simplex, f_dmr, f_skywarn, f_hf])
        await db.commit()
        for f in (f_repeater, f_simplex, f_dmr, f_skywarn, f_hf):
            await db.refresh(f)

        # =================================================================
        # TEMPLATE 1 -- Example County ARES Weekly Net, Tuesdays. Owner
        # W1PINE, staff = Dana (co-manager)/Marcus/Joan, rotation of three.
        # =================================================================
        template_ares = NetTemplate(
            name="Example County ARES Weekly Net",
            description=f"Weekly net for {ORG_ARES}. Check-ins, traffic, and SKYWARN spotter reports welcome.",
            owner_id=users["W1PINE"].id,
            schedule_type="weekly",
            schedule_config=json.dumps({"day_of_week": 2, "time": "19:00"}),  # 0=Sunday -> 2=Tuesday
            field_config=_field_config(enable_skywarn=True, enable_weather=True),
            ics309_enabled=True,
            traffic_enabled=True,
            frequencies=[f_repeater, f_simplex, f_dmr],
        )
        db.add(template_ares)
        await db.flush()
        db.add_all([
            TemplateStaff(template_id=template_ares.id, user_id=users["K1COVE"].id, is_active=True, is_co_manager=True),
            TemplateStaff(template_id=template_ares.id, user_id=users["N1LAKE"].id, is_active=True, is_co_manager=False),
            TemplateStaff(template_id=template_ares.id, user_id=users["W1PORT"].id, is_active=True, is_co_manager=False),
            NCSRotationMember(template_id=template_ares.id, user_id=users["W1PINE"].id, position=1, is_active=True),
            NCSRotationMember(template_id=template_ares.id, user_id=users["W1PORT"].id, position=2, is_active=True),
            NCSRotationMember(template_id=template_ares.id, user_id=users["K1COVE"].id, position=3, is_active=True),
        ])
        await db.commit()
        await db.refresh(template_ares)

        # =================================================================
        # TEMPLATE 2 -- Example County SKYWARN Net, Thursdays. Owner W1PORT.
        # =================================================================
        template_skywarn = NetTemplate(
            name="Example County SKYWARN Net",
            description=f"Severe weather spotter net for {ORG_SKYWARN}.",
            owner_id=users["W1PORT"].id,
            schedule_type="weekly",
            schedule_config=json.dumps({"day_of_week": 4, "time": "19:30"}),  # Thursday
            field_config=_field_config(enable_skywarn=True, enable_weather=True),
            ics309_enabled=True,
            frequencies=[f_skywarn, f_repeater],
        )
        db.add(template_skywarn)
        await db.flush()
        db.add(TemplateStaff(template_id=template_skywarn.id, user_id=users["K1CAMP"].id, is_active=True, is_co_manager=False))
        await db.commit()
        await db.refresh(template_skywarn)

        for tpl in (template_ares, template_skywarn):
            manifest["templates"].append({"id": tpl.id, "name": tpl.name})

        # =================================================================
        # NET A -- ACTIVE, started ~40 minutes ago, from template_ares.
        # Two active NCS (W1PINE + W1PORT) on purpose: GET /nets/{id} has
        # 500'd before on a non-unique "the" active NCS query (see
        # .github/copilot-instructions.md "NCS attribution" / "Backup NCS"
        # history) -- this net's shape exercises that path every time the
        # demo instance is used.
        # =================================================================
        started_at = now - timedelta(minutes=40)
        net_active = Net(
            name="Example County ARES Weekly Net",
            description=f"Weekly net for {ORG_ARES}. Check-ins, traffic, and SKYWARN spotter reports welcome.",
            owner_id=users["W1PINE"].id,
            template_id=template_ares.id,
            status=NetStatus.ACTIVE,
            field_config=_field_config(enable_skywarn=True, enable_weather=True, extra_enabled=["shelter_capacity"]),
            ics309_enabled=True,
            traffic_enabled=True,
            scheduled_start_time=started_at,
            started_at=started_at,
            frequencies=[f_repeater, f_simplex, f_dmr],
        )
        db.add(net_active)
        await db.flush()
        net_active.active_frequency_id = f_repeater.id
        db.add_all([
            NetRole(net_id=net_active.id, user_id=users["W1PINE"].id, role="NCS", active_frequency_id=f_repeater.id,
                    assigned_at=started_at, is_active=True, auto_assigned=True),
            NetRole(net_id=net_active.id, user_id=users["W1PORT"].id, role="NCS", active_frequency_id=f_dmr.id,
                    assigned_at=started_at + timedelta(minutes=5), is_active=True),
            NetRole(net_id=net_active.id, user_id=users["K1COVE"].id, role="LOGGER",
                    assigned_at=started_at, is_active=True),
            NetRole(net_id=net_active.id, user_id=users["N1LAKE"].id, role="RELAY",
                    assigned_at=started_at, is_active=True),
        ])
        await db.commit()
        await db.refresh(net_active)

        # ---- check-ins: every StationStatus, a couple of rechecks, a raised hand ----
        def ci_time(minutes_ago):
            return now - timedelta(minutes=minutes_ago)

        check_ins = {}

        def add_ci(callsign, minutes_ago, status, **kwargs):
            user = users.get(callsign)
            kwargs.setdefault("frequency_id", f_repeater.id)
            ci = CheckIn(
                net_id=net_active.id,
                user_id=user.id if user else None,
                callsign=callsign,
                name=user.name if user else callsign,
                location=user.location if user else "Unknown",
                status=status,
                checked_in_at=ci_time(minutes_ago),
                checked_in_by_id=user.id if user else users["W1PINE"].id,
                **kwargs,
            )
            db.add(ci)
            check_ins[callsign] = ci
            return ci

        add_ci("W1PINE", 40, StationStatus.CHECKED_IN, notes="Net control.")
        add_ci("K1COVE", 39, StationStatus.CHECKED_IN, notes="Logging tonight.")
        add_ci("N1LAKE", 38, StationStatus.RELAY, frequency_id=f_dmr.id)
        add_ci("W1PORT", 37, StationStatus.CHECKED_IN, frequency_id=f_dmr.id, notes="Covering the DMR talkgroup.")
        add_ci("KC1HILL", 35, StationStatus.CHECKED_IN, hand_raised=True)
        add_ci("N1ROVE", 30, StationStatus.MOBILE, notes="Mobile southbound on Route 302.")
        add_ci("K1CAMP", 28, StationStatus.HAS_TRAFFIC,
               custom_fields=json.dumps({"shelter_capacity": "42 beds"}),
               notes="Have a supply request for the shelter.")
        add_ci("W2FERN", 25, StationStatus.LISTENING, skywarn_number="ME-2044")
        add_ci("N2OAKS", 20, StationStatus.AWAY,
               weather_observation="Steady rain, wind gusts to 35 mph from the ENE.")
        add_ci("K3BASE", 15, StationStatus.ANNOUNCEMENTS)
        w1mill = add_ci("W1MILL", 35, StationStatus.CHECKED_OUT)
        w1mill.checked_out_at = ci_time(5)

        # Rechecks: two stations check back in later, creating a second row
        # that links back to the root via parent_check_in_id (matches
        # check_ins.py::create_check_in's recheck path).
        n1bird_root = add_ci("N1BIRD", 12, StationStatus.CHECKED_IN)
        w2fern_root = check_ins["W2FERN"]
        await db.flush()

        n1bird_recheck = CheckIn(
            net_id=net_active.id, user_id=users["N1BIRD"].id, callsign="N1BIRD",
            name=users["N1BIRD"].name, location=users["N1BIRD"].location,
            status=StationStatus.CHECKED_IN, is_recheck=True, parent_check_in_id=n1bird_root.id,
            checked_in_at=ci_time(2), checked_in_by_id=users["N1BIRD"].id, frequency_id=f_repeater.id,
            notes="Back on frequency after a short break.",
        )
        w2fern_recheck = CheckIn(
            net_id=net_active.id, user_id=users["W2FERN"].id, callsign="W2FERN",
            name=users["W2FERN"].name, location=users["W2FERN"].location,
            status=StationStatus.CHECKED_IN, is_recheck=True, parent_check_in_id=w2fern_root.id,
            checked_in_at=ci_time(3), checked_in_by_id=users["W2FERN"].id, frequency_id=f_repeater.id,
            skywarn_number="ME-2044",
        )
        db.add_all([n1bird_recheck, w2fern_recheck])
        await db.commit()

        # ---- chat: system messages, operator messages, a reply, a reaction, a mention ----
        def add_chat(minutes_ago, message, user_key=None, is_system=False, **kwargs):
            msg = ChatMessage(
                net_id=net_active.id,
                user_id=users[user_key].id if user_key else None,
                message=message,
                is_system=is_system,
                created_at=ci_time(minutes_ago),
                **kwargs,
            )
            db.add(msg)
            return msg

        add_chat(40, "W1PINE started the net.", is_system=True)
        add_chat(39, "K1COVE checked in as Logger.", is_system=True)
        msg_greeting = add_chat(34, "Good evening everyone, thanks for checking in. Stand by, we have a shelter supply request coming in from K1CAMP.", "W1PINE")
        msg_signal = add_chat(33, "Copy, listening on the repeater. Nice signal into Bridgton tonight.", "KC1HILL")
        await db.flush()
        add_chat(32, "Same here, good propagation this evening.", "N1LAKE", reply_to_message_id=msg_signal.id)
        add_chat(27, "@W1PINE traffic logged from K1CAMP, ICS-213 filed for the shelter.", "K1COVE",
                 mentioned_user_ids=json.dumps([users["W1PINE"].id]))
        add_chat(28, "K1CAMP has traffic.", is_system=True)
        await db.flush()
        db.add(ChatReaction(message_id=msg_greeting.id, user_id=users["N1ROVE"].id, emoji="👍"))
        await db.commit()

        # ---- traffic: K1CAMP's shelter supply request, ICS-213 ----
        result = await db.execute(
            select(FormDefinition).options(selectinload(FormDefinition.fields))
            .where(FormDefinition.form_type == "ICS213")
        )
        ics213_def = result.scalar_one()
        field_values = {
            "incident_name": "Example County Storm Response",
            "to_name": "EOC Logistics",
            "to_position": "Duty Officer",
            "from_name": "Terry Osgood",
            "from_position": "Freeport Shelter Manager",
            "subject": "Shelter Supply Request",
            "message": "Requesting 50 cots and 20 cases of bottled water delivered to the Freeport shelter by 1800 hours.",
            "priority": "Urgent",
            "reply_requested": "Yes",
        }
        promoted, values = compute_promoted_fields(ics213_def, field_values)
        traffic_form = Form(
            definition_id=ics213_def.id,
            form_type=ics213_def.form_type,
            definition_version=ics213_def.version,
            net_id=net_active.id,
            created_by_id=users["K1CAMP"].id,
            field_values=json.dumps(values),
            **promoted,
        )
        db.add(traffic_form)
        await db.flush()
        await append_entry(
            db, traffic_form, TrafficAction.ORIGINATED,
            reported_by_user_id=users["K1CAMP"].id, net_id=net_active.id,
            occurred_at=ci_time(27), note="Filed during check-in.",
        )

        # =================================================================
        # NET B -- SCHEDULED, a few days out, from template_skywarn.
        # Deliberately unstaffed (no NetRole rows): pre-assigning NCS at
        # creation time is not how this app works -- staff step up when the
        # net actually starts. See "Unstaffed scheduled nets are intended".
        # =================================================================
        next_thursday = now + timedelta(days=4, hours=2)
        net_scheduled = Net(
            name="Example County SKYWARN Net",
            description=f"Severe weather spotter net for {ORG_SKYWARN}.",
            owner_id=users["W1PORT"].id,
            template_id=template_skywarn.id,
            status=NetStatus.SCHEDULED,
            field_config=_field_config(enable_skywarn=True, enable_weather=True),
            ics309_enabled=True,
            scheduled_start_time=next_thursday,
            frequencies=[f_skywarn, f_repeater],
        )
        db.add(net_scheduled)
        await db.flush()
        await db.commit()
        await db.refresh(net_scheduled)

        # =================================================================
        # NET C -- CLOSED, last week, ad hoc (no template) -- the Tuesday
        # Evening Club Net. Full log: ~14 check-ins, chat, ICS-309 export.
        # =================================================================
        closed_start = now - timedelta(days=7, hours=1)
        closed_end = closed_start + timedelta(hours=1, minutes=10)
        net_closed = Net(
            name=ORG_CLUB,
            description="Casual Tuesday evening ragchew and club business.",
            owner_id=users["K1COVE"].id,
            status=NetStatus.CLOSED,
            field_config=_field_config(),
            ics309_enabled=True,
            scheduled_start_time=closed_start,
            started_at=closed_start,
            closed_at=closed_end,
            frequencies=[f_repeater, f_simplex],
        )
        db.add(net_closed)
        await db.flush()
        net_closed.active_frequency_id = f_repeater.id
        db.add_all([
            NetRole(net_id=net_closed.id, user_id=users["K1COVE"].id, role="NCS",
                    assigned_at=closed_start, is_active=True),
            NetRole(net_id=net_closed.id, user_id=users["W1PINE"].id, role="LOGGER",
                    assigned_at=closed_start, is_active=True),
            NetRole(net_id=net_closed.id, user_id=users["N1LAKE"].id, role="RELAY",
                    assigned_at=closed_start, is_active=True),
        ])
        await db.commit()
        await db.refresh(net_closed)

        closed_roster = ["K1COVE", "W1PINE", "N1LAKE", "W1PORT", "KC1HILL", "N1ROVE",
                          "K1CAMP", "W2FERN", "N2OAKS", "K3BASE", "W1MILL", "N1BIRD"]
        offset = 0
        n1rove_first = None
        for callsign in closed_roster:
            offset += 4
            user = users[callsign]
            ci = CheckIn(
                net_id=net_closed.id, user_id=user.id, callsign=callsign, name=user.name,
                location=user.location, status=StationStatus.CHECKED_IN,
                checked_in_at=closed_start + timedelta(minutes=offset),
                checked_in_by_id=users["K1COVE"].id, frequency_id=f_repeater.id,
            )
            db.add(ci)
            if callsign == "N1ROVE":
                n1rove_first = ci
        # One recheck to get to ~14 rows: N1ROVE checked out mid-net and
        # rechecked back in later.
        await db.flush()
        n1rove_first.status = StationStatus.CHECKED_OUT
        n1rove_first.checked_out_at = closed_start + timedelta(minutes=40)
        db.add(CheckIn(
            net_id=net_closed.id, user_id=users["N1ROVE"].id, callsign="N1ROVE",
            name=users["N1ROVE"].name, location=users["N1ROVE"].location,
            status=StationStatus.CHECKED_IN, is_recheck=True, parent_check_in_id=n1rove_first.id,
            checked_in_at=closed_start + timedelta(minutes=55), checked_in_by_id=users["K1COVE"].id,
            frequency_id=f_repeater.id, notes="Back from a supply run.",
        ))
        # W1DEMO (admin) rounds this out to 14 rows and gives the admin
        # account a real participation history.
        db.add(CheckIn(
            net_id=net_closed.id, user_id=users["W1DEMO"].id, callsign="W1DEMO",
            name=users["W1DEMO"].name, location=users["W1DEMO"].location,
            status=StationStatus.CHECKED_IN,
            checked_in_at=closed_start + timedelta(minutes=50), checked_in_by_id=users["K1COVE"].id,
            frequency_id=f_repeater.id,
        ))
        await db.commit()

        def add_closed_chat(minutes_after_start, message, user_key=None, is_system=False):
            db.add(ChatMessage(
                net_id=net_closed.id,
                user_id=users[user_key].id if user_key else None,
                message=message,
                is_system=is_system,
                created_at=closed_start + timedelta(minutes=minutes_after_start),
            ))

        add_closed_chat(0, "K1COVE started the net.", is_system=True)
        add_closed_chat(6, "Evening all, good turnout tonight.", "K1COVE")
        add_closed_chat(12, "73 from Windham, nothing to report this week.", "N1LAKE")
        add_closed_chat(20, "Reminder: club breakfast is Saturday at 8am.", "W1PINE")
        add_closed_chat(45, "Heading out for a supply run, back shortly.", "N1ROVE")
        add_closed_chat(70, "K1COVE closed the net.", is_system=True)
        await db.commit()

        # =================================================================
        # NET D -- ACTIVE, ad hoc, just started, nobody assigned as NCS and
        # nothing logged yet. This is the state a net is in for the first
        # thirty seconds of its life, and there is no other way to
        # photograph it: "Claim NCS" only appears on an active or lobby net
        # that has no NCS at all, and the tutorial that walks somebody
        # through starting their own net needs a figure of it.
        # =================================================================
        net_unstaffed = Net(
            name="Bridgton Simplex Exercise",
            description="Ad hoc simplex coverage test. Nothing logged yet.",
            owner_id=users["W1PINE"].id,
            status=NetStatus.ACTIVE,
            field_config=_field_config(),
            ics309_enabled=True,
            started_at=now - timedelta(minutes=1),
            frequencies=[f_simplex],
        )
        db.add(net_unstaffed)
        await db.flush()
        net_unstaffed.active_frequency_id = f_simplex.id
        await db.commit()
        await db.refresh(net_unstaffed)

        # =================================================================
        # A truly custom (non-builtin) check-in field, so the admin Fields
        # tab shows more than just the shipped builtins.
        # =================================================================
        db.add(FieldDefinition(
            name="shelter_capacity", label="Shelter Capacity", field_type="number",
            placeholder="e.g. 42 beds", default_enabled=False, default_required=False,
            is_builtin=False, sort_order=200,
        ))
        await db.commit()

        # "key" is what scripts/docs-screenshots/capture.mjs matches a
        # {{net:...}} placeholder against first, so every net has an explicit
        # one. Two nets are ACTIVE now, and matching on status alone would
        # make {{net:active}} depend on seeding order.
        manifest["nets"] = [
            {"key": "active", "id": net_active.id, "name": net_active.name, "status": net_active.status.value, "template_id": net_active.template_id},
            {"key": "scheduled", "id": net_scheduled.id, "name": net_scheduled.name, "status": net_scheduled.status.value, "template_id": net_scheduled.template_id},
            {"key": "closed", "id": net_closed.id, "name": net_closed.name, "status": net_closed.status.value, "template_id": net_closed.template_id},
            {"key": "unstaffed", "id": net_unstaffed.id, "name": net_unstaffed.name, "status": net_unstaffed.status.value, "template_id": net_unstaffed.template_id},
        ]

        current_code, _prev_code = current_totp_codes(admin_totp_secret)
        manifest["admin_mfa"] = {
            "callsign": "W1DEMO",
            "secret": admin_totp_secret,
            "current_code_at_generation_time": current_code,
            "note": (
                "W1DEMO (admin) has MFA enabled because app/dependencies.py::get_admin_user "
                "hard-blocks the admin panel for any admin without mfa_enabled -- see the "
                "comment there. Load `secret` into any TOTP app (or run "
                "`python -c \"import pyotp; print(pyotp.TOTP('SECRET').now())\"` with this "
                "secret) to get a current 6-digit code for /auth/login's totp_code field."
            ),
        }

    await engine.dispose()

    out_path.write_text(json.dumps(manifest, indent=2))
    print(f"Seeded {db_path}")
    print(f"Wrote manifest to {out_path}")


def main():
    args = parse_args()
    db_path = Path(args.db).resolve()
    out_path = Path(args.out).resolve()

    # Must be set before app.config/app.database are imported (inside
    # _build), since Settings() is instantiated once at import time.
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

    # `import app...` needs backend/ on sys.path, same as it would be when
    # uvicorn is launched from within backend/.
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    # Always build from scratch: delete any existing file at --db plus its
    # SQLite sidecar files (WAL/SHM/journal), so stale rows never survive a
    # re-run under a different version of this script.
    for suffix in ("", "-wal", "-shm", "-journal"):
        p = Path(str(db_path) + suffix)
        if p.exists():
            p.unlink()

    asyncio.run(_build(db_path, out_path))


if __name__ == "__main__":
    main()
