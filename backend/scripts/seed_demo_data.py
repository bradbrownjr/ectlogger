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
# Demo backups go in their own folder, never the real instance's backend/backups.
# scripts/docs-screenshots/run.sh starts the demo backend with the same value.
os.environ.setdefault("BACKUP_DIR", str(Path(__file__).resolve().parent.parent / "demo-backups"))

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
        FieldDefinition, CanHearReport, CoverageSite, CoverageAccess, CoverageContact,
        DrillPlan, DrillObjective, DrillEvent, TrafficTestCategory, OffNetLogEntry,
        TopicHistory, UserEmail,
    )
    from app.traffic.exercise import mark_exercise_text
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
        # One backup sign-in address, so Profile > Security's Backup emails
        # list has a row to show (docs figure security-backup-emails).
        db.add(UserEmail(user_id=users["KC1HILL"].id, email="priya.home@example.org"))
        await db.commit()

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
        f_hf = Frequency(frequency="3.930", mode="SSB", description="Example County ARES HF Net")
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

        # ---- off-net log: two accepted entries, and a station's own Winlink
        # entry still awaiting review (docs/net-control/off-net-log.md) ----
        db.add_all([
            OffNetLogEntry(net_id=net_active.id, occurred_at=ci_time(30), from_station="W1PINE",
                           to_station="State ARES HF Net", channel="3.940 LSB",
                           message="Checked in for Example County", status="accepted",
                           entered_by_user_id=users["W1PINE"].id),
            OffNetLogEntry(net_id=net_active.id, occurred_at=ci_time(22), from_station="N1LAKE",
                           to_station="Statewide DMR talkgroup", channel="DMR TG 3100",
                           message="Relayed the net's status to the state desk", status="accepted",
                           entered_by_user_id=users["K1COVE"].id),
            OffNetLogEntry(net_id=net_active.id, occurred_at=ci_time(10), from_station="K1CAMP",
                           to_station="Harbor County EMA", channel="Winlink",
                           message="Sent the shelter status report", message_id="4QX7T2KDM8RA",
                           status="pending", entered_by_user_id=users["K1CAMP"].id),
        ])
        await db.commit()

        # ---- prior topics: tonight's, and a few earlier weeks with no net of
        # their own here (docs/operators/chat-and-polls.md, Prior topics) ----
        db.add_all([
            TopicHistory(template_id=template_ares.id, net_id=net_active.id, used_date=started_at,
                         topic="What's in your go-kit that you'd never leave without?"),
        ] + [
            TopicHistory(template_id=template_ares.id, used_date=started_at - timedelta(weeks=n), topic=t)
            for n, t in [
                (1, "Which antenna would you put up first after a storm?"),
                (2, "How do you keep a radio charged when the power is out?"),
                (3, "What was your first contact on the air?"),
                (4, "Which repeater do you rely on most, and why?"),
            ]
        ])
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
        # NET E -- ACTIVE, ad hoc, Authenticated Net turned on. The only
        # way to photograph the identity padlock and the verify dialog: every
        # row shape the page describes is here -- a verified station, two
        # verifiable ones, an account with no two-factor set up, and a guest
        # check-in with no account at all. The MFA accounts are ones no
        # figure signs in as, so enabling MFA on them cannot break a capture
        # (capture.mjs reads their secrets from manifest["mfa_secrets"]).
        # =================================================================
        mfa_secrets = {}
        for callsign in ("N1LAKE", "K1CAMP", "W2FERN"):
            secret = generate_totp_secret()
            users[callsign].mfa_enabled = True
            users[callsign].mfa_secret_encrypted = encrypt_mfa_secret(secret)
            mfa_secrets[callsign] = secret
        auth_started = now - timedelta(minutes=12)
        net_authenticated = Net(
            name="Example County ARES Identity Drill",
            description="Practice net for verifying stations by their authenticator code.",
            owner_id=users["W1PINE"].id,
            status=NetStatus.ACTIVE,
            field_config=_field_config(),
            ics309_enabled=True,
            authenticated=True,
            started_at=auth_started,
            frequencies=[f_repeater],
        )
        db.add(net_authenticated)
        await db.flush()
        net_authenticated.active_frequency_id = f_repeater.id
        db.add(NetRole(net_id=net_authenticated.id, user_id=users["W1PINE"].id, role="NCS",
                       active_frequency_id=f_repeater.id, assigned_at=auth_started, is_active=True))
        for callsign, minutes_after, verified in (
            ("W1PINE", 0, False), ("N1LAKE", 2, True), ("K1CAMP", 4, False),
            ("W2FERN", 6, False), ("N1ROVE", 8, False), ("N2OAKS", 10, False),
        ):
            # N2OAKS is logged as a guest (no linked account) on purpose: the
            # page says a guest row's padlock is fixed and unclickable.
            user = users[callsign] if callsign != "N2OAKS" else None
            db.add(CheckIn(
                net_id=net_authenticated.id,
                user_id=user.id if user else None,
                callsign=callsign,
                name=user.name if user else "",
                location=user.location if user else "",
                status=StationStatus.CHECKED_IN,
                frequency_id=f_repeater.id,
                checked_in_at=auth_started + timedelta(minutes=minutes_after),
                checked_in_by_id=users["W1PINE"].id,
                identity_verified=verified,
                identity_verified_at=(auth_started + timedelta(minutes=minutes_after + 1)) if verified else None,
                identity_verified_by_id=users["W1PINE"].id if verified else None,
            ))
        await db.commit()
        await db.refresh(net_authenticated)

        # =================================================================
        # NET F -- ACTIVE, ad hoc, station-to-station coverage logging on,
        # on one simplex frequency. The coverage figures (the "I hear"
        # button, the dialog, the Station Coverage panel, the map overlay,
        # the Profile coverage map) all come from here, so coverage is never
        # switched on for the main active net and none of its figures move.
        # Reports are a deliberate mix: four confirmed two-way pairs, several
        # one-way, one station heard before it checked out, and two stations
        # (W1PORT, K1CAMP) with nothing reported yet so a figure can open a
        # fresh dialog. KC1HILL's reports were entered by the Logger, which
        # is the case the Profile map used to drop (fixed 2026-10-20).
        # =================================================================
        drill_started = now - timedelta(minutes=30)
        net_coverage = Net(
            name="Example County ARES Simplex Drill",
            description="Monthly simplex drill: who can hear whom without the repeater.",
            owner_id=users["W1PINE"].id,
            status=NetStatus.ACTIVE,
            field_config=_field_config(),
            ics309_enabled=True,
            propagation_logging_enabled=True,
            self_can_hear_enabled=True,
            started_at=drill_started,
            frequencies=[f_simplex],
        )
        db.add(net_coverage)
        await db.flush()
        net_coverage.active_frequency_id = f_simplex.id
        db.add_all([
            NetRole(net_id=net_coverage.id, user_id=users["W1PINE"].id, role="NCS",
                    active_frequency_id=f_simplex.id, assigned_at=drill_started, is_active=True),
            NetRole(net_id=net_coverage.id, user_id=users["K1COVE"].id, role="LOGGER",
                    assigned_at=drill_started, is_active=True),
        ])
        drill_check_ins = {}
        for callsign, minutes_after in (
            ("W1PINE", 0), ("K1COVE", 1), ("N1LAKE", 3), ("KC1HILL", 4), ("W1PORT", 6),
            ("K1CAMP", 7), ("W2FERN", 9), ("N2OAKS", 10), ("W1MILL", 12),
        ):
            user = users[callsign]
            ci = CheckIn(
                net_id=net_coverage.id, user_id=user.id, callsign=callsign, name=user.name,
                location=user.location, status=StationStatus.CHECKED_IN, frequency_id=f_simplex.id,
                checked_in_at=drill_started + timedelta(minutes=minutes_after),
                checked_in_by_id=user.id,
            )
            db.add(ci)
            drill_check_ins[callsign] = ci
        drill_check_ins["W1MILL"].status = StationStatus.CHECKED_OUT
        drill_check_ins["W1MILL"].checked_out_at = now - timedelta(minutes=8)
        await db.flush()

        def add_can_hear(net, cis, reporter, heard_list, reported_by, minutes_ago, frequency_id=None, position="Home"):
            cis[reporter].operating_position = position
            for heard in heard_list:
                db.add(CanHearReport(
                    net_id=net.id, reporter_check_in_id=cis[reporter].id,
                    heard_check_in_id=cis[heard].id, frequency_id=frequency_id,
                    reported_by_user_id=users[reported_by].id,
                    reported_at=now - timedelta(minutes=minutes_ago),
                ))

        add_can_hear(net_coverage, drill_check_ins, "KC1HILL", ["K1COVE", "N1LAKE", "W1PORT", "K1CAMP", "W1MILL"],
                     "K1COVE", 18, f_simplex.id)
        add_can_hear(net_coverage, drill_check_ins, "W1PINE", ["K1COVE", "W2FERN", "N2OAKS"], "W1PINE", 16, f_simplex.id)
        add_can_hear(net_coverage, drill_check_ins, "N1LAKE", ["KC1HILL", "W1PORT", "K1COVE"], "N1LAKE", 14, f_simplex.id)
        add_can_hear(net_coverage, drill_check_ins, "K1COVE", ["W1PINE", "N1LAKE", "W2FERN", "KC1HILL"], "K1COVE", 12,
                     f_simplex.id)
        await db.commit()
        await db.refresh(net_coverage)

        # =================================================================
        # NET G -- ACTIVE, ad hoc, coverage logging on two bands (2m simplex
        # and 80m). Exists only for the per-frequency grid the "who can
        # hear" dialog switches to when a net has two or more frequencies.
        # N1LAKE has a partial report, so one column's All stations box shows
        # partly checked.
        # =================================================================
        twoband_started = now - timedelta(minutes=20)
        net_twoband = Net(
            name="Example County ARES Two-Band Drill",
            description="Coverage comparison between 2m simplex and the 80m HF net.",
            owner_id=users["W1PINE"].id,
            status=NetStatus.ACTIVE,
            field_config=_field_config(),
            ics309_enabled=True,
            propagation_logging_enabled=True,
            self_can_hear_enabled=True,
            started_at=twoband_started,
            frequencies=[f_simplex, f_hf],
        )
        db.add(net_twoband)
        await db.flush()
        net_twoband.active_frequency_id = f_simplex.id
        db.add(NetRole(net_id=net_twoband.id, user_id=users["W1PINE"].id, role="NCS",
                       active_frequency_id=f_simplex.id, assigned_at=twoband_started, is_active=True))
        twoband_check_ins = {}
        for callsign, minutes_after in (("W1PINE", 0), ("N1LAKE", 2), ("K1COVE", 3), ("KC1HILL", 5), ("N1ROVE", 6)):
            user = users[callsign]
            ci = CheckIn(
                net_id=net_twoband.id, user_id=user.id, callsign=callsign, name=user.name,
                location=user.location, status=StationStatus.CHECKED_IN, frequency_id=f_simplex.id,
                checked_in_at=twoband_started + timedelta(minutes=minutes_after),
                checked_in_by_id=users["W1PINE"].id,
            )
            db.add(ci)
            twoband_check_ins[callsign] = ci
        await db.flush()
        add_can_hear(net_twoband, twoband_check_ins, "N1LAKE", ["K1COVE"], "W1PINE", 8, f_simplex.id)
        add_can_hear(net_twoband, twoband_check_ins, "N1LAKE", ["W1PINE", "K1COVE", "KC1HILL", "N1ROVE"], "W1PINE", 8,
                     f_hf.id)
        await db.commit()
        await db.refresh(net_twoband)

        # =================================================================
        # NET H -- ACTIVE, ad hoc, a Simulated Emergency Test: coverage by
        # site. Teams at two primary offices, two shelters and a weather
        # office, plus one home station, on 2m simplex and 80m, with the
        # county repeater and DMR talkgroup left out of coverage reports.
        # The reports give one of each result: direct two-way (Gray to the
        # EOC), a relay through another site (Naples to the EOC), a relay
        # through a home station (Freeport to the EOC), and no path
        # (Freeport to the North Office). Three repeaters and nodes have
        # reached and couldn't-reach results with notes, and two contacts
        # outside the net give a Counties reached list. Facility names are
        # invented; the towns are the roster's own.
        # =================================================================
        set_started = now - timedelta(minutes=90)
        net_set = Net(
            name="Example County ARES Simulated Emergency Test",
            description="Annual SET: which shelters and offices can reach the EOC, and how.",
            owner_id=users["W1PINE"].id,
            status=NetStatus.ACTIVE,
            field_config=_field_config(),
            ics309_enabled=True,
            propagation_logging_enabled=True,
            self_can_hear_enabled=True,
            started_at=set_started,
            frequencies=[f_simplex, f_hf, f_repeater, f_dmr],
            coverage_excluded_frequency_ids=json.dumps([f_repeater.id, f_dmr.id]),
            traffic_enabled=True,
        )
        db.add(net_set)
        await db.flush()
        net_set.active_frequency_id = f_simplex.id
        site_specs = [
            ("Example County EOC", "Windham, ME", "office", True, None),
            ("North Office", "Bridgton, ME", "office", True, None),
            ("Naples Shelter", "Naples, ME", "shelter", False, None),
            ("Freeport Shelter", "Freeport, ME", "shelter", False, None),
            ("Gray Weather Office", "FN43rv", "office", False, None),
            ("County VHF repeater", "Windham, ME", "infrastructure", False, f_repeater.id),
            ("County UHF repeater", "Windham, ME", "infrastructure", False, None),
            ("EOC packet node", "Windham, ME", "infrastructure", False, None),
        ]
        set_sites = {}
        for order, (name, location, site_type, primary, freq_id) in enumerate(site_specs):
            site = CoverageSite(net_id=net_set.id, name=name, location=location, site_type=site_type,
                                is_primary=primary, frequency_id=freq_id, sort_order=order)
            db.add(site)
            set_sites[name] = site
        # As if imported from the EMA's lists: the supported shelter carries
        # the list's columns, and the sites nobody staffs are net-staff-only.
        set_sites["Naples Shelter"].address = "14 Example Road"
        set_sites["Naples Shelter"].notes = "Shelter manager, 555-0131. Enter by the gym doors."
        set_sites["Naples Shelter"].details = json.dumps(
            {"Emergency Capacity": "150", "Long term Capacity": "60", "Generator": "Yes", "OPS Plan status": "Current"})
        imported_specs = [
            ("Sebago Elementary School", "Sebago, ME", "shelter", "3 Sample Street", None, None,
             "Principal, 555-0132", {"Emergency Capacity": "90", "Generator": "No"}),
            ("Raymond Fire Station", "Raymond, ME", "pod", "12 Example Road", 43.9012, -70.4701,
             "Station chief, 555-0141", {"LANES": "2"}),
            ("Casco Community Hall", "Casco, ME", "pod", "40 Sample Street", 43.9568, -70.5225,
             "Hall manager, 555-0142", {"LANES": "1"}),
        ]
        for i, (name, location, site_type, address, lat, lon, notes, details) in enumerate(imported_specs):
            db.add(CoverageSite(net_id=net_set.id, name=name, location=location, site_type=site_type,
                                address=address, latitude=lat, longitude=lon, notes=notes,
                                details=json.dumps(details), is_supported=False,
                                sort_order=len(site_specs) + i))
        await db.flush()
        db.add_all([
            NetRole(net_id=net_set.id, user_id=users["W1PINE"].id, role="NCS",
                    active_frequency_id=f_simplex.id, assigned_at=set_started, is_active=True),
            NetRole(net_id=net_set.id, user_id=users["N1LAKE"].id, role="LOGGER",
                    assigned_at=set_started, is_active=True),
        ])
        set_check_ins = {}
        for callsign, site_name, minutes_after in (
            ("W1PINE", "North Office", 0), ("N1LAKE", "Example County EOC", 1), ("N2OAKS", "North Office", 2),
            ("W1MILL", "Example County EOC", 3), ("K1COVE", "Naples Shelter", 6), ("K1CAMP", "Freeport Shelter", 9),
            ("KC1HILL", "Gray Weather Office", 11), ("W2FERN", None, 14),
        ):
            user = users[callsign]
            site = set_sites.get(site_name) if site_name else None
            ci = CheckIn(
                net_id=net_set.id, user_id=user.id, callsign=callsign, name=user.name,
                location=f"{site.name} {site.location}" if site and site.location.startswith("FN")
                else (f"{site.name}, {site.location}" if site else user.location),
                status=StationStatus.CHECKED_IN, frequency_id=f_simplex.id,
                checked_in_at=set_started + timedelta(minutes=minutes_after),
                checked_in_by_id=users["N1LAKE"].id,
                coverage_site_id=site.id if site else None,
                operating_position=site.name[:50] if site else "Home",
            )
            db.add(ci)
            set_check_ins[callsign] = ci
        await db.flush()

        def set_heard(reporter, heard_list, frequency_id, minutes_ago):
            for heard in heard_list:
                db.add(CanHearReport(
                    net_id=net_set.id, reporter_check_in_id=set_check_ins[reporter].id,
                    heard_check_in_id=set_check_ins[heard].id, frequency_id=frequency_id,
                    reported_by_user_id=users["N1LAKE"].id, reported_at=now - timedelta(minutes=minutes_ago),
                ))

        set_heard("N1LAKE", ["W1PINE", "KC1HILL", "W2FERN"], f_hf.id, 60)       # EOC on 80m
        set_heard("N1LAKE", ["KC1HILL", "W2FERN"], f_simplex.id, 58)
        set_heard("W1PINE", ["N1LAKE"], f_hf.id, 57)                             # North <-> EOC on 80m
        set_heard("W1PINE", ["K1COVE"], f_simplex.id, 55)
        set_heard("W1MILL", ["N2OAKS"], f_simplex.id, 50)                         # EOC heard North one way on 2m
        set_heard("K1COVE", ["W1PINE"], f_simplex.id, 45)                         # Naples <-> North
        set_heard("K1CAMP", ["N1LAKE", "W2FERN"], f_simplex.id, 40)               # Freeport heard the EOC one way
        set_heard("W2FERN", ["K1CAMP", "N1LAKE"], f_simplex.id, 38)               # home station relays Freeport
        set_heard("KC1HILL", ["N1LAKE"], f_simplex.id, 30)                        # Gray <-> EOC on 2m

        def set_access(callsign, target, reached, note=None, minutes_ago=35):
            db.add(CoverageAccess(
                net_id=net_set.id, reporter_check_in_id=set_check_ins[callsign].id,
                target_site_id=set_sites[target].id, reached=reached, note=note,
                reported_by_user_id=users["N1LAKE"].id, reported_at=now - timedelta(minutes=minutes_ago),
            ))

        set_access("K1COVE", "County VHF repeater", True)
        set_access("K1COVE", "County UHF repeater", False, "No signal from the shelter's basement radio room")
        set_access("K1COVE", "EOC packet node", False, "Node antenna sits lower on the tower than the repeater's")
        set_access("K1CAMP", "County VHF repeater", True, "Full quieting at 50 W")
        set_access("KC1HILL", "County VHF repeater", True)
        set_access("KC1HILL", "County UHF repeater", True)
        set_access("KC1HILL", "EOC packet node", True)
        db.add_all([
            CoverageContact(net_id=net_set.id, reporter_check_in_id=set_check_ins["KC1HILL"].id,
                            frequency_id=f_hf.id, callsign="K1YRKE", station="York County EOC",
                            county="York", state="ME", two_way=True, reported_by_user_id=users["N1LAKE"].id),
            CoverageContact(net_id=net_set.id, reporter_check_in_id=set_check_ins["K1COVE"].id,
                            frequency_id=f_simplex.id, callsign="W1ANDY", station="Androscoggin County EOC",
                            county="Androscoggin", state="ME", two_way=False, reported_by_user_id=users["N1LAKE"].id),
        ])
        await db.commit()
        await db.refresh(net_set)

        # ---- the SET's drill plan: objectives, a schedule of events, and
        # three prepared ICS-213s: one received at the EOC, one sent, one
        # not sent yet. The first two are filed drill forms, exactly as
        # routers/drill_plans.py::send_drill_message files them. ----
        exercise_name = "2026 Example County SET"
        drill_plan = DrillPlan(
            net_id=net_set.id,
            exercise_name=exercise_name,
            exercise_when="Saturday, October 24, 2026, 0800 to 1200",
            location="Example County shelters, the EOC, the North Office and the Gray Weather Office",
            purpose="Test whether each shelter and office can reach the county's two primary offices, "
                    "and which repeaters and nodes each one gets into, with the commercial network down.",
            scenario="A winter storm has left most of the county without power. Phones and cellular service "
                     "are down. Two shelters are open and the EOC has activated.",
            announcement="Every net announces that it is an exercise at its start, during, and at its end. "
                         "Every formal or tactical message says \"This is an exercise\" at its beginning and end.",
            updated_by_id=users["W1PINE"].id,
        )
        db.add(drill_plan)
        await db.flush()
        county = "Example County ARES (EC - W1PINE)"
        for order, (heading, text, rating, note) in enumerate([
            ("Section objectives", "Check into the section HF net, or by Winlink if no HF capability.", "P", None),
            ("Section objectives", "Send one request for support message to the state EMA.", None, None),
            (county, "Establish 2m simplex between every shelter and the EOC.", "S",
             "Freeport needed a home station to relay."),
            (county, "Establish HF and 2m with the Gray Weather Office.", None, None),
            (county, "Send and retrieve Winlink traffic from each shelter.", None, None),
            (county, "Relay a simulated request for support to an adjacent county EOC.", None, None),
        ]):
            db.add(DrillObjective(plan_id=drill_plan.id, heading=heading, text=text, rating=rating,
                                  result_note=note, sort_order=order))

        def prepared(to_name, to_position, from_name, from_position, subject, message, priority="Routine"):
            return {"to_name": to_name, "to_position": to_position, "from_name": from_name,
                    "from_position": from_position, "subject": subject, "message": message,
                    "priority": priority, "reply_requested": "Yes"}

        event_specs = [
            ("08:00", "NCS", "All stations", "Control", "2m simplex, 80m", None,
             "Net opens. Exercise announcement.", "Every site checks in and reports its power source.", None),
            ("08:30", "Naples Shelter", "Example County EOC", "Message", "2m simplex", "Naples Shelter",
             "Shelter supply request.", "EOC acknowledges and logs the request.",
             prepared("EOC Logistics", "Duty Officer", "Shelter Manager", "Naples Shelter", "Cots and water",
                      "Shelter at 60 occupants. Request 40 cots and 10 cases of water by 1400.", "Urgent")),
            ("09:00", "Freeport Shelter", "Example County EOC", "Message", "2m simplex", "Freeport Shelter",
             "Status report.", "Relay through any station if there is no direct path.",
             prepared("EOC Operations", "Operations Chief", "Shelter Manager", "Freeport Shelter", "Shelter status",
                      "Shelter open on generator power. 22 occupants. No medical needs.")),
            ("09:30", "Gray Weather Office", "Example County EOC", "Message", "80m SSB", "Gray Weather Office",
             "Weather update.", "EOC passes it to all sites.",
             prepared("EOC Operations", "Operations Chief", "Meteorologist", "Gray Weather Office",
                      "Storm update", "Snow ending by 1500. Winds gusting to 40 mph through the evening.")),
            ("10:00", "Every site", "County VHF and UHF repeaters, EOC packet node", "Control", "Repeaters, packet",
             None, "Repeater and node access checks.", "Record reached or couldn't reach, with a note.", None),
            ("12:00", "NCS", "All stations", "Control", "2m simplex, 80m", None,
             "End of exercise.", "Hot wash at each site immediately after.", None),
        ]
        for order, (time_label, initiator, receiver, event_type, method, site_name, description,
                    expected, message) in enumerate(event_specs):
            event = DrillEvent(
                plan_id=drill_plan.id, sort_order=order, time_label=time_label, initiator=initiator,
                receiver=receiver, event_type=event_type, method=method, description=description,
                expected_actions=expected, site_id=set_sites[site_name].id if site_name else None,
                message=json.dumps(message) if message else None,
            )
            db.add(event)
            if site_name in ("Naples Shelter", "Freeport Shelter"):
                values = dict(message, incident_name=exercise_name, message=mark_exercise_text(message["message"]))
                promoted, values = compute_promoted_fields(ics213_def, values)
                drill_form = Form(
                    definition_id=ics213_def.id, form_type=ics213_def.form_type,
                    definition_version=ics213_def.version, net_id=net_set.id,
                    created_by_id=users["N1LAKE"].id, field_values=json.dumps(values),
                    test_category=TrafficTestCategory.DRILL, **promoted,
                )
                db.add(drill_form)
                await db.flush()
                sent_at = set_started + timedelta(minutes=30 if site_name == "Naples Shelter" else 60)
                await append_entry(
                    db, drill_form, TrafficAction.ORIGINATED, handled_by=site_name,
                    reported_by_user_id=users["N1LAKE"].id, net_id=net_set.id, occurred_at=sent_at,
                    note="Prepared message from the drill plan",
                )
                if site_name == "Naples Shelter":
                    await append_entry(
                        db, drill_form, TrafficAction.RECEIVED, handled_by="Example County EOC",
                        reported_by_user_id=users["N1LAKE"].id, net_id=net_set.id,
                        occurred_at=sent_at + timedelta(minutes=4),
                    )
                event.form_id = drill_form.id
        await db.commit()

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

        await _seed_backups(db, now, users["W1DEMO"])
        await _seed_activity(db, now, users, net_closed, template_ares)

        # "key" is what scripts/docs-screenshots/capture.mjs matches a
        # {{net:...}} placeholder against first, so every net has an explicit
        # one. Several nets are ACTIVE, and matching on status alone would
        # make {{net:active}} depend on seeding order.
        manifest["nets"] = [
            {"key": "active", "id": net_active.id, "name": net_active.name, "status": net_active.status.value, "template_id": net_active.template_id},
            {"key": "scheduled", "id": net_scheduled.id, "name": net_scheduled.name, "status": net_scheduled.status.value, "template_id": net_scheduled.template_id},
            {"key": "closed", "id": net_closed.id, "name": net_closed.name, "status": net_closed.status.value, "template_id": net_closed.template_id},
            {"key": "unstaffed", "id": net_unstaffed.id, "name": net_unstaffed.name, "status": net_unstaffed.status.value, "template_id": net_unstaffed.template_id},
            {"key": "authenticated", "id": net_authenticated.id, "name": net_authenticated.name, "status": net_authenticated.status.value, "template_id": net_authenticated.template_id},
            {"key": "coverage", "id": net_coverage.id, "name": net_coverage.name, "status": net_coverage.status.value, "template_id": net_coverage.template_id},
            {"key": "twoband", "id": net_twoband.id, "name": net_twoband.name, "status": net_twoband.status.value, "template_id": net_twoband.template_id},
            {"key": "set", "id": net_set.id, "name": net_set.name, "status": net_set.status.value, "template_id": net_set.template_id},
        ]
        manifest["mfa_secrets"] = mfa_secrets

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


# =====================================================================
# BACKUPS -- an instance a week into scheduled backups: a key, a daily
# schedule, one SFTP drop point, and history including one off-site copy
# that failed. The backup files are sparse placeholders of the recorded
# size; nothing is ever decrypted from them. They exist so the admin tab
# counts them as kept on this server and offers its row actions.
# =====================================================================

DEMO_BACKUP_PASSPHRASE = "demo backup passphrase, not a real one"


async def _seed_backups(db, now, admin):
    import secrets
    from app.backup import archive, runner, targets
    from app.backup.paths import backup_dir, ensure_private_dir
    from app.models import BackupRun, BackupSettings, BackupTarget

    directory = backup_dir()
    if directory.is_dir():
        for old in directory.iterdir():
            if old.is_file():
                old.unlink()
    ensure_private_dir(directory)

    settings_row = BackupSettings(
        id=1, enabled=True, enabled_at=now - timedelta(days=8),
        schedule_mode="daily", daily_time="03:00", schedule_timezone="America/New_York",
        last_scheduler_check_at=now - timedelta(minutes=4),
    )
    runner.set_passphrase(settings_row, DEMO_BACKUP_PASSPHRASE)
    settings_row.key_created_at = now - timedelta(days=8)
    db.add(settings_row)
    runner.write_key_file(settings_row)

    private_pem, _public = targets.generate_ssh_keypair("ectlogger-backup")
    host_key = " ".join(targets.public_key_of(targets.generate_ssh_keypair("drop-point")[0]).split()[:2])
    target = BackupTarget(
        name="Example County EOC", kind="sftp", enabled=True,
        config_json=json.dumps({"host": "backups.example.org", "port": 2222,
                                "username": "ectlogger", "path": "upload"}),
        secret_encrypted=targets.encrypt_secret(private_pem),
        trusted_host_key=host_key, prune_enabled=False,
    )
    db.add(target)
    await db.flush()

    def result(ok, message=""):
        return json.dumps([{"target_id": target.id, "name": target.name, "ok": ok, "message": message}])

    # Newest first: last night's scheduled run, yesterday's manual one (checked),
    # then five more nights, one of which could not reach the drop point.
    runs = []
    last_03 = now.replace(hour=7, minute=0, second=0, microsecond=0)  # 03:00 EDT
    if last_03 > now:
        last_03 -= timedelta(days=1)
    for day in range(6):
        runs.append(dict(trigger="scheduled", started_at=last_03 - timedelta(days=day),
                         ok=(day != 3)))
    runs.insert(1, dict(trigger="manual", started_at=last_03 - timedelta(hours=9), ok=True,
                        verified=True))
    size = 3_400_000
    for spec in reversed(runs):  # oldest first, so ids and sizes grow with time
        started = spec["started_at"]
        name = archive.backup_filename(started)
        size += 17_000
        run = BackupRun(
            trigger=spec["trigger"],
            triggered_by_id=admin.id if spec["trigger"] == "manual" else None,
            status="success" if spec["ok"] else "partial",
            started_at=started, finished_at=started + timedelta(seconds=6),
            filename=name, size_bytes=size, sha256=secrets.token_hex(32),
            key_fingerprint=settings_row.key_fingerprint,
            target_results=result(True) if spec["ok"] else result(
                False, "Could not connect to backups.example.org:2222: timed out"),
        )
        if spec.get("verified"):
            run.verified_at = started + timedelta(minutes=3)
            run.verify_ok = True
            run.verify_detail = "Every file matched its checksum and the database passed its integrity check."
        db.add(run)
        placeholder = directory / name
        with open(placeholder, "wb") as fh:
            fh.truncate(size)
    await db.commit()


async def _seed_activity(db, now, users, net_closed, template_ares):
    """A week of the activity log (docs/admins/activity-log.md). Addresses
    are from the documentation ranges (RFC 5737), never real ones. N1ROVE's
    two wrong passwords and second account on the same address give the
    "accounts seen from this address" box something to show."""
    from app.models import AuditEvent

    browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131.0"
    phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1"

    def event(minutes_ago, action, actor, ip, agent=browser, **kw):
        user = users.get(actor) if actor else None
        db.add(AuditEvent(
            created_at=(now - timedelta(minutes=minutes_ago)).replace(tzinfo=None),
            action=action, actor_user_id=user.id if user else None,
            actor_label=actor, ip=ip, user_agent=agent if ip else None, **kw,
        ))

    closed = dict(target_type="net", target_id=net_closed.id, target_label=net_closed.name, net_id=net_closed.id)
    event(7 * 1440 - 5, "auth.signed_in", "K1COVE", "203.0.113.24", details=json.dumps({"method": "email link"}))
    event(7 * 1440 - 80, "net.closed", "K1COVE", "203.0.113.24", **closed)
    event(6 * 1440, "check_in.deleted", "K1COVE", "203.0.113.24", subject_user_id=users["N1ROVE"].id,
          details=json.dumps({"station": "N1ROVE"}), **closed)
    event(3 * 1440, "schedule.staff_added", "W1PINE", "198.51.100.14",
          target_type="schedule", target_id=template_ares.id, target_label=template_ares.name,
          template_id=template_ares.id, subject_user_id=users["KC1HILL"].id,
          details=json.dumps({"station": "KC1HILL"}))
    event(2 * 1440, "user.profile_changed", "KC1HILL", "198.51.100.61", phone,
          target_type="user", target_id=users["KC1HILL"].id, target_label="KC1HILL",
          subject_user_id=users["KC1HILL"].id,
          details=json.dumps({"changes": {"location": ["Bridgton, ME", "FN43ob"]}}))
    event(95, "auth.password_failed", "N1ROVE", "192.0.2.77")
    event(94, "auth.password_failed", "N1ROVE", "192.0.2.77")
    event(90, "auth.signed_in", "N1DUNE", "192.0.2.77", details=json.dumps({"method": "email link"}))
    # An earlier occurrence, no longer in the demo: an archived entry keeps its name.
    event(60, "net.auto_archived", None, None, target_type="net", target_label=template_ares.name,
          template_id=template_ares.id, details=json.dumps({"reason": "the schedule's next net was created"}))
    event(20, "auth.signed_in", "W1DEMO", "203.0.113.5", details=json.dumps({"method": "password"}))
    await db.commit()


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
