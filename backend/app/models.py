from sqlalchemy import BigInteger, Column, Float, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Table, UniqueConstraint, Index
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func
from app.database import Base
from app.band_utils import band_from_frequency_string
import enum
import json


# Association tables for many-to-many relationships
net_frequencies = Table(
    'net_frequencies',
    Base.metadata,
    Column('net_id', Integer, ForeignKey('nets.id', ondelete='CASCADE')),
    Column('frequency_id', Integer, ForeignKey('frequencies.id', ondelete='CASCADE'))
)

net_invitations = Table(
    'net_invitations',
    Base.metadata,
    Column('net_id', Integer, ForeignKey('nets.id', ondelete='CASCADE')),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE')),
    Column('accepted', Boolean, default=False),
    Column('invited_at', DateTime(timezone=True), server_default=func.now())
)

net_template_frequencies = Table(
    'net_template_frequencies',
    Base.metadata,
    Column('template_id', Integer, ForeignKey('net_templates.id', ondelete='CASCADE')),
    Column('frequency_id', Integer, ForeignKey('frequencies.id', ondelete='CASCADE'))
)


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    NCS = "ncs"
    USER = "user"
    GUEST = "guest"


class NetStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    LOBBY = "lobby"  # Pre-net mode: check-ins and chat allowed, countdown to official start
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"
    # Terminal, like ARCHIVED, but for an occurrence that never happened at all
    # (e.g. cancelled ahead of time). Kept as a row instead of deleted so the
    # reminder scheduler can see "this slot was intentionally skipped" and the
    # cancellation stays visible/findable instead of just disappearing. Only
    # reachable from DRAFT/SCHEDULED - see cancel_net in routers/nets_export.py.
    CANCELLED = "cancelled"


class StationStatus(str, enum.Enum):
    CHECKED_IN = "checked_in"
    HAS_TRAFFIC = "has_traffic"
    LISTENING = "listening"
    RELAY = "relay"
    AWAY = "away"
    ANNOUNCEMENTS = "announcements"
    MOBILE = "mobile"
    # Checked in on site with no radio (staff at an EOC or shelter during an
    # exercise or incident), so net control doesn't call them on the air. An
    # in-person check-in has no frequency (routers/check_ins.py).
    IN_PERSON = "in_person"
    CHECKED_OUT = "checked_out"


class FormDisposition(str, enum.Enum):
    """Derived from the traffic log, never stored. Defined here so schemas and
    query filters share one vocabulary."""
    DRAFT = "draft"
    PENDING = "pending"
    RELAYED = "relayed"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class TrafficAction(str, enum.Enum):
    ORIGINATED = "originated"
    RECEIVED = "received"
    RELAYED = "relayed"
    DELIVERED = "delivered"
    SERVICED = "serviced"
    CANCELLED = "cancelled"


class RelayMethod(str, enum.Enum):
    VOICE_NET = "voice_net"
    CW_NET = "cw_net"
    DIGITAL_NET = "digital_net"
    PHONE = "phone"
    EMAIL = "email"
    IN_PERSON = "in_person"
    POSTAL = "postal"
    OTHER = "other"


class TrafficTestCategory(str, enum.Enum):
    """A Form's real/not-real status. None (unset) means real traffic.
    DRILL simulates a real incident and is deliberately NOT exempted from
    anything -- same reminder ladder, same append-only chain of custody,
    same appearance in ICS-309/Net Report exports -- it only carries a label
    for after-action review. DEMO is throwaway test data: excluded from
    reminders and from ICS-309/Net Report/summary-count output, and
    deletable by its creator or an admin regardless of log-entry history."""
    DRILL = "drill"
    DEMO = "demo"


# Profile fields an admin can padlock so the user can't change them from
# their own Profile page (User.locked_fields, enforced in
# routers/users.py::update_my_profile). Every one of these is also editable
# in the Admin Users "Edit User" dialog. 'email' is lockable but currently
# inert: there is no self-service email field to block yet.
LOCKABLE_USER_FIELDS = (
    'name', 'callsign', 'email', 'gmrs_callsign', 'callsigns',
    'location', 'skywarn_number', 'website_url',
)


class User(Base):
    __tablename__ = "users"

    def get_locked_fields(self) -> list:
        """locked_fields decoded; a malformed value locks nothing.
        UserResponse.from_orm replaces the column with the decoded list in
        place (same as callsigns), so a list is accepted as-is."""
        if isinstance(self.locked_fields, list):
            return self.locked_fields
        try:
            value = json.loads(self.locked_fields or '[]')
        except (json.JSONDecodeError, TypeError):
            return []
        return value if isinstance(value, list) else []

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255))
    callsign = Column(String(50), unique=True, index=True)  # Primary callsign (Amateur Radio)
    locked_fields = Column(Text, default='[]', nullable=False)  # JSON array of LOCKABLE_USER_FIELDS an admin has padlocked: the user's own PUT /users/me can't change them. Replaced name_locked/callsign_locked/email_locked (migration 079)
    gmrs_callsign = Column(String(50), unique=True, index=True, nullable=True)  # GMRS callsign (e.g., WROP123)
    callsigns = Column(Text, default='[]')  # JSON array of additional callsigns
    previous_callsigns = Column(Text, default='[]')  # JSON array of former primary callsigns (auto-populated on callsign change)
    banned_callsign = Column(String(50), nullable=True)  # Primary callsign a ban took off this account, so the real operator can use it; unban puts it back if still free (routers/users.py)
    role = Column(Enum(UserRole), default=UserRole.USER, index=True)
    oauth_provider = Column(String(50))  # google, microsoft, github, email
    oauth_id = Column(String(255), unique=True, index=True)
    is_active = Column(Boolean, default=True, index=True)
    email_notifications = Column(Boolean, default=True)  # Master switch for all emails
    notify_net_start = Column(Boolean, default=True)  # Notify when subscribed net starts
    notify_net_close = Column(Boolean, default=True)  # Notify when subscribed net closes (with log)
    notify_net_reminder = Column(Boolean, default=False)  # Reminder 1 hour before subscribed net
    notify_ics309 = Column(Boolean, default=False)  # Send ICS-309 format instead of standard log
    notify_whats_new = Column(Boolean, default=False)  # Daily 8 AM digest of new platform features (off by default)
    notify_traffic_reminder = Column(Boolean, default=True)  # Escalating reminder ladder for traffic you're holding too long (D4). On by default -- an operational obligation, not a passive preference.
    timezone = Column(String(64), nullable=True)  # IANA timezone (e.g. "America/New_York") used to schedule per-user emails. Falls back to PST when unset.
    unsubscribe_token = Column(String(64), unique=True, index=True, nullable=True)  # Token for one-click email unsubscribe
    show_activity_in_chat = Column(Boolean, default=True)  # Show check-in/out activity in chat
    location_awareness = Column(Boolean, default=False)  # Enable browser geolocation for grid square
    sms_gateway = Column(String(255))  # email-to-sms gateway address
    skywarn_number = Column(String(50))
    location = Column(String(255))  # User's default/static location
    live_location = Column(String(50))  # GPS-derived grid square (updated automatically)
    live_location_updated = Column(DateTime(timezone=True))  # When live_location was last updated
    live_location_town = Column(String(100))  # "Town, ST" reverse-geocoded from the same GPS fix as live_location
    prefer_utc = Column(Boolean, default=False)  # Display times in UTC instead of local time
    last_active = Column(DateTime(timezone=True), index=True)  # Last API request timestamp for online tracking
    schedule_age_bypass = Column(Boolean, default=False)  # Admin-granted early access to schedule creation
    walkthrough_seen = Column(Boolean, default=False)  # Set true after user dismisses the onboarding walkthrough
    avatar_url = Column(String(500), nullable=True)  # Custom profile image URL; overrides Gravatar when set
    website_url = Column(String(500), nullable=True)  # Personal website / YouTube channel link, shown on profile popup
    dashboard_sort_order = Column(String(16), nullable=False, default='status', server_default='status')  # 'status' (active first, then next up) or 'alpha'
    schedule_sort_order = Column(String(16), nullable=False, default='date', server_default='date')  # 'date' (next occurrence first) or 'alpha'
    theme = Column(String(32), nullable=True)  # Named color theme key; null = follow system default
    password_hash = Column(String(255), nullable=True)  # bcrypt hash; null until the user sets a password. Magic link works either way -- this is the fallback for when email delivery is down.
    failed_password_attempts = Column(Integer, default=0, nullable=False)  # Resets to 0 on a successful password login
    password_locked_until = Column(DateTime(timezone=True), nullable=True)  # Temporary lockout after MAX_FAILED_PASSWORD_ATTEMPTS in a row
    mfa_enabled = Column(Boolean, default=False, nullable=False)  # Required for UserRole.ADMIN (enforced in get_admin_user); optional self-service for everyone else
    mfa_secret_encrypted = Column(Text, nullable=True)  # Fernet-encrypted TOTP secret (key derived from secret_key via HKDF)
    mfa_backup_codes = Column(Text, nullable=True)  # JSON list of SHA-256 hashes of unused single-use backup codes
    mfa_pending_secret_encrypted = Column(Text, nullable=True)  # Staged replacement secret while self-service "replace authenticator" is in progress; not live until confirmed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owned_nets = relationship("Net", back_populates="owner", foreign_keys="Net.owner_id")
    owned_templates = relationship("NetTemplate", back_populates="owner", foreign_keys="NetTemplate.owner_id")
    template_subscriptions = relationship("NetTemplateSubscription", back_populates="user")
    check_ins = relationship("CheckIn", back_populates="user", foreign_keys="CheckIn.user_id")
    chat_messages = relationship("ChatMessage", back_populates="user")


class Net(Base):
    __tablename__ = "nets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    info_url = Column(String(500))  # URL for net, club, or organization info
    stream_url = Column(String(500))  # Audio stream URL (Shoutcast, Broadcastify, etc.)
    logo_url = Column(String(500), nullable=True)  # Uploaded club/net logo; shown on net cards and the check-in header
    script = Column(Text)  # Net script for NCS to follow during net operations
    announcements = Column(Text)  # General traffic/announcements for NCS to reference during net
    status = Column(Enum(NetStatus), default=NetStatus.DRAFT)
    owner_id = Column(Integer, ForeignKey("users.id"))
    active_frequency_id = Column(Integer, ForeignKey("frequencies.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("net_templates.id"), nullable=True)
    field_config = Column(Text, default='{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "power": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}')  # JSON config for check-in fields
    ics309_enabled = Column(Boolean, default=False)  # Generate ICS-309 format on close
    # On by default: a station net-muted (ChatNetMute) for spam/disruption is
    # excluded from the ICS-309 Communications Log's chat rows -- the copy
    # that goes to a served agency -- even though the stored chat log/plain
    # net log keep everything. See app/traffic/ics309.py::get_ics309_muted_user_ids.
    ics309_hide_muted_stations = Column(Boolean, nullable=False, default=True)
    propagation_logging_enabled = Column(Boolean, default=False)  # Enable "can hear" station-to-station coverage logging
    self_can_hear_enabled = Column(Boolean, default=True)  # If False, only NCS/logger/relay may record "can hear" reports; regular stations can't self-report
    # JSON array of this net's frequency ids that do NOT collect coverage
    # reports (a drill's repeater or DMR talkgroup: everyone hears everyone
    # through it, so a station-to-station report says nothing). Null/empty =
    # every frequency collects them, which is what every net did before
    # 2026-10-21. An exclusion list rather than an inclusion list so a
    # frequency added to the net later collects reports by default.
    coverage_excluded_frequency_ids = Column(Text, nullable=True)
    # Opt-in like ics309_enabled/propagation_logging_enabled above. The default
    # only applies to newly inserted rows, so nets created before the settings
    # toggle existed keep their stored True and don't lose the panel.
    traffic_enabled = Column(Boolean, default=False)  # Enable the per-net Traffic panel + toolbar button
    # Which form types this net takes. JSON array of form_type codes; null =
    # every enabled definition. Filters the pickers only -- the API still
    # accepts an off-list type so unusual traffic is never rejected mid-incident.
    traffic_form_types = Column(Text, nullable=True)
    # The RRI/WX strip this net collects. Either a defined type (labels come
    # from the definition) or a raw pasted origin strip (positional fields) --
    # see TrafficSettingsPanel.tsx and migration 056.
    traffic_strip_form_type = Column(String(32), nullable=True)
    traffic_strip_template = Column(Text, nullable=True)
    mobile_priority_sort = Column(Boolean, default=True)  # Promote mobile stations above chronological order
    chat_grace_period_minutes = Column(Integer, nullable=True)  # Minutes to keep chat open after close; null = disabled
    self_checkin_enabled = Column(Boolean, default=True)  # If False, only NCS/logger-entered check-ins are accepted
    # Lets NCS/Logger reveal a checked-in station's current TOTP code (never the
    # secret) to confirm they are who they claim over the air. Requires the
    # station's own account to have MFA enrolled; unenrolled stations just show
    # as unverified. See app/auth.py::current_totp_codes.
    authenticated = Column(Boolean, default=False)
    # A net for the stations taking part in an event or incident (a drill's
    # deployed teams), not for everyone listening. Self check-in stays open,
    # since nobody knows ahead of time who will volunteer; the net shows a
    # "Participants only" chip and the check-in form says so, and net control
    # removes anyone else with NetBlock. Not enforcement on its own.
    participants_only = Column(Boolean, default=False)

    # Auto-open lobby: minutes before scheduled_start_time that the scheduler
    # moves this net to LOBBY on its own. Null = disabled (the default). Copied
    # from the template at auto-create time; the per-net value is authoritative
    # so an NCS can switch it off for a single occurrence.
    auto_lobby_minutes = Column(Integer, nullable=True)
    # Auto-close on inactivity: minutes since the last check-in/recheck/chat
    # message (falling back to started_at if the net has neither) after which
    # the scheduler closes an ACTIVE net on its own. Null = disabled (the
    # default) -- a long SKYWARN/ARES activation can legitimately go hours
    # between check-ins, so this must never close a net nobody asked it to.
    # Copied from the template at auto-create time; the per-net value is
    # authoritative, same pattern as auto_lobby_minutes above.
    auto_close_after_minutes = Column(Integer, nullable=True)
    # True only when the scheduler opened the lobby. Lets the stale sweep archive
    # a lobby nobody attended without ever undoing a human's manual open.
    lobby_opened_automatically = Column(Boolean, nullable=False, default=False)
    # Set when the one-and-only "net starting" email goes out, making that send
    # idempotent across the several transitions that can trigger it.
    start_notification_sent_at = Column(DateTime(timezone=True), nullable=True)

    # Topic of the Week / Poll features for community nets
    topic_of_week_enabled = Column(Boolean, default=False)
    topic_of_week_prompt = Column(String(500))  # The topic question, e.g., "What's your favorite radio?"
    poll_enabled = Column(Boolean, default=False)
    poll_question = Column(String(500))  # The poll question, e.g., "What mode do you use most?"

    scheduled_start_time = Column(DateTime(timezone=True))  # When the net is scheduled to start
    started_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    # Closed with "finish the log later": set at close, cleared when net
    # control sends the log (POST /nets/{id}/send-log). While set, the
    # closing email hasn't gone out, net control can still add and fix
    # check-ins, chat is closed, and the net can't be archived.
    # log_hold_reminded_at paces the daily reminder to the net's managers
    # (services/net_log_hold.py).
    log_held_since = Column(DateTime(timezone=True), nullable=True)
    log_held_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    log_hold_reminded_at = Column(DateTime(timezone=True), nullable=True)
    # Set only when auto-close held the log because nobody would be credited
    # as NCS (migration 093): the managers are asked who ran it, and at this
    # time the log goes out anyway, with "NCS: Not recorded". A hold net
    # control chose never sends itself.
    log_hold_send_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_reason = Column(String(500), nullable=True)  # Optional operator-entered note, e.g. "in-person meeting instead"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Set while the net has no actively-present NCS (assigned NCS exists but
    # all are away/not checked in); cleared and folded into
    # total_paused_seconds the moment an NCS is present again. See
    # app/net_pause.py.
    paused_at = Column(DateTime(timezone=True), nullable=True)
    total_paused_seconds = Column(Integer, default=0)

    # Relationships
    owner = relationship("User", back_populates="owned_nets", foreign_keys=[owner_id])
    template = relationship("NetTemplate", back_populates="nets", foreign_keys=[template_id])
    frequencies = relationship("Frequency", secondary=net_frequencies, back_populates="nets")
    active_frequency = relationship("Frequency", foreign_keys=[active_frequency_id])
    check_ins = relationship("CheckIn", back_populates="net", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="net", cascade="all, delete-orphan")
    net_roles = relationship("NetRole", back_populates="net", cascade="all, delete-orphan")
    custom_field_values = relationship("CustomFieldValue", back_populates="net", cascade="all, delete-orphan")
    can_hear_reports = relationship("CanHearReport", back_populates="net", cascade="all, delete-orphan")
    coverage_sites = relationship("CoverageSite", back_populates="net", cascade="all, delete-orphan", order_by="CoverageSite.sort_order")
    coverage_contacts = relationship("CoverageContact", back_populates="net", cascade="all, delete-orphan")
    forms = relationship("Form", back_populates="net")   # no cascade: traffic outlives the net
    drill_plan = relationship("DrillPlan", back_populates="net", uselist=False, cascade="all, delete-orphan")


class NetTemplate(Base):
    __tablename__ = "net_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    info_url = Column(String(500))  # URL for net, club, or organization info
    stream_url = Column(String(500))  # Audio stream URL (Shoutcast, Broadcastify, etc.) - default for nets created from this schedule
    logo_url = Column(String(500), nullable=True)  # Seeds Net.logo_url for nets created from this template; also shown on the schedule card
    script = Column(Text)  # Net script template
    announcements = Column(Text)  # Default announcements/traffic carried forward to nets created from this schedule
    owner_id = Column(Integer, ForeignKey("users.id"))
    fifth_week_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # The 5th-week operator when they have no account yet; never set together
    # with fifth_week_user_id. See services/callsign_people.py.
    fifth_week_callsign = Column(String(50), nullable=True)
    field_config = Column(Text, default='{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "power": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}')
    is_active = Column(Boolean, default=True)
    ics309_enabled = Column(Boolean, default=False)  # Enable ICS-309 format for net close emails
    ics309_hide_muted_stations = Column(Boolean, nullable=False, default=True)  # Seeds Net.ics309_hide_muted_stations for nets created from this template
    propagation_logging_enabled = Column(Boolean, default=False)  # Seeds Net.propagation_logging_enabled for nets created from this template
    self_can_hear_enabled = Column(Boolean, default=True)  # Seeds Net.self_can_hear_enabled for nets created from this template
    coverage_excluded_frequency_ids = Column(Text, nullable=True)  # Seeds Net.coverage_excluded_frequency_ids (same JSON shape)
    traffic_enabled = Column(Boolean, default=False)  # Seeds Net.traffic_enabled for nets created from this template
    # Seed the three per-net traffic settings above; same null semantics.
    traffic_form_types = Column(Text, nullable=True)
    traffic_strip_form_type = Column(String(32), nullable=True)
    traffic_strip_template = Column(Text, nullable=True)
    traffic_escalation_digest = Column(Boolean, default=False)  # Opt-in weekly stale-traffic digest to this template's manager (D4). Off by default -- a badge in the traffic panel is the default escalation path; this is for groups that need active chasing.
    mobile_priority_sort = Column(Boolean, default=True)  # Promote mobile stations above chronological order
    chat_grace_period_minutes = Column(Integer, nullable=True)  # Minutes to keep chat open after close; null = disabled
    self_checkin_enabled = Column(Boolean, default=True)  # If False, nets from this schedule accept only NCS/logger-entered check-ins
    authenticated = Column(Boolean, default=False)  # Seeds Net.authenticated for nets created from this template
    participants_only = Column(Boolean, default=False)  # Seeds Net.participants_only
    # Default auto-open-lobby offset for nets created from this schedule, in
    # minutes before the scheduled start. Null = disabled (the default).
    auto_lobby_minutes = Column(Integer, nullable=True)
    # Default auto-close-on-inactivity minutes for nets created from this
    # schedule. Null = disabled (the default). See Net.auto_close_after_minutes.
    auto_close_after_minutes = Column(Integer, nullable=True)

    # Topic of the Week / Poll features for community nets
    topic_of_week_enabled = Column(Boolean, default=False)
    topic_of_week_prompt = Column(String(500))  # Default topic question for nets from this template
    poll_enabled = Column(Boolean, default=False)
    poll_question = Column(String(500))  # Default poll question for nets from this template
    
    # Schedule configuration
    schedule_type = Column(String(20), default='ad_hoc')  # ad_hoc, daily, weekly, monthly
    schedule_config = Column(Text, default='{}')  # JSON: {day_of_week: 0-6, week_of_month: 1-5, time: "18:00"}

    # Movable start point for the NCS rotation. The rotation stores no "whose turn
    # is next" pointer -- each assignment is derived by counting occurrences elapsed
    # since an anchor. This column is re-stamped whenever the roster's membership or
    # order changes, so the first occurrence after an edit belongs to whoever is now
    # at position 1. Null = never edited, fall back to the created_at-derived anchor.
    # See routers/ncs_schedule.py::get_rotation_anchor_date.
    rotation_anchor_date = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", back_populates="owned_templates", foreign_keys=[owner_id])
    fifth_week_user = relationship("User", foreign_keys=[fifth_week_user_id])
    frequencies = relationship("Frequency", secondary=net_template_frequencies)
    subscriptions = relationship("NetTemplateSubscription", back_populates="template", cascade="all, delete-orphan")
    favorites = relationship("ScheduleFavorite", cascade="all, delete-orphan")
    nets = relationship("Net", back_populates="template")
    staff = relationship("TemplateStaff", back_populates="template", cascade="all, delete-orphan")
    rotation_members = relationship("NCSRotationMember", back_populates="template", cascade="all, delete-orphan", order_by="NCSRotationMember.position")
    schedule_overrides = relationship("NCSScheduleOverride", back_populates="template", cascade="all, delete-orphan")
    topic_history = relationship("TopicHistory", back_populates="template", cascade="all, delete-orphan")


class NetTemplateSubscription(Base):
    __tablename__ = "net_template_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    subscribed_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    template = relationship("NetTemplate", back_populates="subscriptions")
    user = relationship("User", back_populates="template_subscriptions")


class ScheduleFavorite(Base):
    """A schedule someone starred. Starred schedules lead the Schedule page and
    their nets lead the dashboard (routers/schedule_favorites.py). Saved per
    account so the stars follow the person to every device; until 2026-10-30
    they lived in each browser's localStorage only (Brad). Account merge picks
    this table up by its foreign key and drops a duplicate star via the
    unique constraint (services/account_merge.py)."""
    __tablename__ = "schedule_favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'template_id', name='uq_schedule_favorite'),
    )


class Frequency(Base):
    __tablename__ = "frequencies"

    id = Column(Integer, primary_key=True, index=True)
    frequency = Column(String(50), nullable=True)  # e.g., "146.520 MHz" (optional for digital modes)
    mode = Column(String(50), nullable=False)  # e.g., "FM", "SSB", "DMR", "YSF", "D-STAR"
    network = Column(String(100), nullable=True)  # e.g., "Wires-X", "Brandmeister", "REF030C"
    talkgroup = Column(String(50), nullable=True)  # e.g., "31665", "Room 12345"
    description = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Who added it to the shared list (migration 086). They may fix or remove
    # it while no other net uses it (routers/frequencies.py::change_refusal).
    # Null for rows added before 086, which stay admin-only.
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    @property
    def band(self):
        """Amateur band label (e.g. "2m", "40m") derived from `frequency`.
        See band_utils.py; None for digital-mode entries with no analog
        frequency, or a value outside every mapped band."""
        return band_from_frequency_string(self.frequency)

    # Relationships
    nets = relationship("Net", secondary=net_frequencies, back_populates="frequencies")


class TopicHistory(Base):
    __tablename__ = "topic_history"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"))
    topic = Column(Text, nullable=False)
    used_date = Column(DateTime(timezone=True), nullable=False)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    template = relationship("NetTemplate", back_populates="topic_history")
    net = relationship("Net")


class NetRole(Base):
    __tablename__ = "net_roles"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String(50), nullable=False)  # NCS, LOGGER, RELAY
    active_frequency_id = Column(Integer, ForeignKey("frequencies.id", ondelete="SET NULL"), nullable=True)  # Frequency this NCS is monitoring
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)  # False when operator has temporarily stepped down to participant
    # True only for the NCS role _assign_duty_ncs stamps from the rotation at
    # auto-create time. Lets a later roster edit find and replace just the
    # rotation's own pick on a not-yet-started net -- never a human's choice.
    auto_assigned = Column(Boolean, default=False, nullable=False)

    # Relationships
    net = relationship("Net", back_populates="net_roles")
    user = relationship("User")
    active_frequency = relationship("Frequency")


class CheckIn(Base):
    __tablename__ = "check_ins"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Required fields
    callsign = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    grid_square = Column(String(10))  # Station's live grid, kept when location is the town it resolved to (live_location_for_check_in)
    
    # Optional fields
    skywarn_number = Column(String(50))
    weather_observation = Column(Text)
    power_source = Column(String(255))
    power = Column(String(255))  # Power output (e.g., "100W", "50W mobile")
    feedback = Column(Text)
    notes = Column(Text)
    relayed_by = Column(String(50))  # Callsign of relay station if this check-in was relayed
    
    # Topic of the Week / Poll responses
    topic_response = Column(Text)  # Free-form answer to topic of the week
    poll_response = Column(String(255))  # Answer to poll question
    
    # Custom field values (JSON object: {"field_name": "value", ...})
    custom_fields = Column(Text, default='{}')
    
    # Status and tracking
    status = Column(Enum(StationStatus), default=StationStatus.CHECKED_IN)
    frequency_id = Column(Integer, ForeignKey("frequencies.id"))  # Frequency they checked in on
    available_frequencies = Column(Text, default='[]')  # JSON array of frequency IDs they can reach
    is_recheck = Column(Boolean, default=False)
    parent_check_in_id = Column(Integer, ForeignKey("check_ins.id", ondelete="SET NULL"), nullable=True)
    checked_in_by_id = Column(Integer, ForeignKey("users.id"))  # Who logged this check-in
    hand_raised = Column(Boolean, default=False)  # Hand raised to indicate comments/questions
    operating_position = Column(String(50), nullable=True)  # Classifier for the reporting station, e.g. "Home"/"Field Deployed" (freeSolo, not an enum)
    # The net's coverage site this station is operating from (a shelter, an
    # EMA office). Per check-in ROW, not per callsign: an operator who checks
    # out at one shelter and rechecks from another gets a new row at the new
    # site, and the reports made from the first visit stay with the first
    # site. See services/site_coverage.py.
    coverage_site_id = Column(Integer, ForeignKey("coverage_sites.id", ondelete="SET NULL"), nullable=True, index=True)

    # Authenticated nets: set once NCS/Logger has compared the station's live
    # TOTP code to the server-computed expected code and confirmed a match.
    # Only meaningful when Net.authenticated is True; otherwise unused.
    identity_verified = Column(Boolean, default=False)
    identity_verified_at = Column(DateTime(timezone=True), nullable=True)
    identity_verified_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    checked_in_at = Column(DateTime(timezone=True), server_default=func.now())
    # A station added to a held log whose time nobody wrote down (migration
    # 097). checked_in_at is then the net's close, so the row sorts last;
    # reports print no time and time-based statistics leave it out.
    time_not_recorded = Column(Boolean, nullable=False, default=False)
    # The station was checked in In person, with no radio. Kept after it
    # checks out (which overwrites status), so the ICS-309, a log of radio
    # traffic, can leave the row out. Set from status by _track_in_person.
    in_person = Column(Boolean, nullable=False, default=False)
    checked_out_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @validates('status')
    def _track_in_person(self, _key, status):
        # Every way a status is set goes through here (check-in, edit,
        # import). Checking out keeps the flag; any other status clears it,
        # since the station is back on the air.
        if status == StationStatus.IN_PERSON:
            self.in_person = True
        elif status is not None and status != StationStatus.CHECKED_OUT:
            self.in_person = False
        return status

    # Relationships
    net = relationship("Net", back_populates="check_ins")
    user = relationship("User", foreign_keys=[user_id], back_populates="check_ins")
    checked_in_by = relationship("User", foreign_keys=[checked_in_by_id])
    identity_verified_by = relationship("User", foreign_keys=[identity_verified_by_id])
    frequency = relationship("Frequency")
    parent_check_in = relationship("CheckIn", remote_side="CheckIn.id", foreign_keys=[parent_check_in_id])
    custom_values = relationship("CustomFieldValue", back_populates="check_in", cascade="all, delete-orphan")
    coverage_site = relationship("CoverageSite")
    coverage_contacts = relationship(
        "CoverageContact", foreign_keys="CoverageContact.reporter_check_in_id",
        back_populates="reporter_check_in", cascade="all, delete-orphan"
    )
    coverage_access = relationship(
        "CoverageAccess", foreign_keys="CoverageAccess.reporter_check_in_id",
        back_populates="reporter_check_in", cascade="all, delete-orphan"
    )
    can_hear_reports_as_reporter = relationship(
        "CanHearReport", foreign_keys="CanHearReport.reporter_check_in_id",
        back_populates="reporter_check_in", cascade="all, delete-orphan"
    )
    can_hear_reports_as_heard = relationship(
        "CanHearReport", foreign_keys="CanHearReport.heard_check_in_id",
        back_populates="heard_check_in", cascade="all, delete-orphan"
    )


class OffNetLogEntry(Base):
    """Something a station did off this net that belongs in the net's
    communications log: a check-in to another net, a call on a statewide
    talkgroup, a Winlink message sent to another county. One row becomes one
    ICS-309 row (services/ics309_log.py).

    It records that the contact happened, never its content: a Winlink
    message's text stays with the station (message_id lets the printed copy
    be matched to its row). It is not a situational-awareness report about
    someone else; see the "Log what you hear once" roadmap item.

    Entries from net staff count straight away. A station's own entry waits
    for NCS, Logger or a net manager (permissions.may_review_off_net_log)
    before it reaches the ICS-309.
    """
    __tablename__ = "off_net_log_entries"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    from_station = Column(String(100), nullable=False)
    to_station = Column(String(200), nullable=False)    # "Maine ARES Net", "York County EMA"
    channel = Column(String(200), nullable=True)        # "3.940 LSB", "DMR TG 3123", "Winlink"
    message = Column(String(1000), nullable=False)      # what happened, one line
    message_id = Column(String(100), nullable=True)     # Winlink or other message ID
    status = Column(String(20), nullable=False, default="accepted")  # see OFF_NET_LOG_STATUSES
    entered_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    entered_by = relationship("User", foreign_keys=[entered_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])


# pending: a station's own entry, not on the ICS-309 until reviewed.
OFF_NET_LOG_STATUSES = ("pending", "accepted", "rejected")


class CoverageSite(Base):
    """A place a coverage drill is testing from, such as a shelter or an EMA
    office, listed on one net by its manager. Coverage between sites is a
    read-time rollup over CanHearReport rows grouped by each check-in's
    coverage_site_id (services/site_coverage.py), never a stored matrix.

    Net-scoped on purpose: this is the short-term form of the team's
    supported locations (docs/concepts/TEAM-MANAGEMENT-NOTES.md section 5.6,
    TeamLocation), and its fields match that design so the list can move to
    team settings later.
    """
    __tablename__ = "coverage_sites"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    # Town and state, or a grid square: anything the check-in map can place.
    location = Column(String(255), nullable=True)
    site_type = Column(String(20), nullable=False, default="shelter")  # see COVERAGE_SITE_TYPES
    # Infrastructure only: the net frequency it's on, when it's one of them.
    frequency_id = Column(Integer, ForeignKey("frequencies.id"), nullable=True)
    # A site every other site is graded against ("can it reach the EMA?").
    is_primary = Column(Boolean, nullable=False, default=False)
    # Imported from an EMA's list (routers/coverage_sites.py::parse_site_file).
    # Street address and exact coordinates; the map uses the coordinates
    # when there are any.
    address = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    # Net staff only, always: contacts, capacity, generator, and every other
    # column of the source spreadsheet (details is a JSON object of them).
    notes = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    # A site the net is staffing. Only supported sites, primaries, repeaters
    # and nodes, and sites someone has checked in at are shown to anyone but
    # net staff: an EMA's full shelter list must never read as a list of open
    # shelters (see coverage_site_in_use).
    is_supported = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    net = relationship("Net", back_populates="coverage_sites")
    access_reports = relationship("CoverageAccess", foreign_keys="CoverageAccess.target_site_id", cascade="all, delete-orphan")


# "infrastructure" is a repeater, packet node or Winlink gateway: a target a
# site tries to get into (CoverageAccess), not a place operators report from.
COVERAGE_SITE_TYPES = ("eoc", "office", "shelter", "pod", "staging", "hospital", "other", "infrastructure")


class CoverageAccess(Base):
    """Whether a check-in got into one of the net's repeaters or nodes (a
    CoverageSite of type "infrastructure"). Unlike CanHearReport, a failure
    is recorded too: "couldn't reach the UHF repeater from the hospital" is
    a finding, not missing data. No row means nobody tried."""
    __tablename__ = "coverage_access"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_check_in_id = Column(Integer, ForeignKey("check_ins.id", ondelete="CASCADE"), nullable=False, index=True)
    target_site_id = Column(Integer, ForeignKey("coverage_sites.id", ondelete="CASCADE"), nullable=False, index=True)
    reached = Column(Boolean, nullable=False)
    note = Column(String(500), nullable=True)
    reported_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reported_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('reporter_check_in_id', 'target_site_id', name='uq_coverage_access'),
    )

    reporter_check_in = relationship("CheckIn", foreign_keys=[reporter_check_in_id], back_populates="coverage_access")


class CoverageContact(Base):
    """A station reached that never checked into the net, such as a
    neighboring county's EOC, recorded by the station that reached it. Kept
    apart from CanHearReport because there is no check-in on the far end to
    point at, and so no reciprocal report: direction is recorded instead."""
    __tablename__ = "coverage_contacts"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_check_in_id = Column(Integer, ForeignKey("check_ins.id", ondelete="CASCADE"), nullable=False, index=True)
    frequency_id = Column(Integer, ForeignKey("frequencies.id"), nullable=True)
    callsign = Column(String(20), nullable=True)
    station = Column(String(100), nullable=True)  # "York County EOC"
    county = Column(String(100), nullable=True)
    state = Column(String(50), nullable=True)
    two_way = Column(Boolean, nullable=False, default=True)  # False = heard them only
    reported_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reported_at = Column(DateTime(timezone=True), server_default=func.now())

    net = relationship("Net", back_populates="coverage_contacts")
    reporter_check_in = relationship("CheckIn", foreign_keys=[reporter_check_in_id], back_populates="coverage_contacts")


# Ratings an after-action report gives each objective, from the Homeland
# Security Exercise and Evaluation Program (HSEEP) AAR/IP template.
DRILL_OBJECTIVE_RATINGS = {
    'P': 'Performed without Challenges',
    'S': 'Performed with Some Challenges',
    'M': 'Performed with Major Challenges',
    'U': 'Unable to be Performed',
}


class DrillPlan(Base):
    """The exercise plan for one net's drill, such as an ARES Simulated
    Emergency Test: scenario, objectives, and a schedule of events whose
    message rows carry a prepared ICS-213 for the site that sends it.

    Net-scoped for now, one plan per net (one net per drill). Its shape
    follows the incident and drill planner design
    (docs/concepts/TEAM-INCIDENT-PLANNER.md section 5.12) so it can move to
    the incident record or a team later; that document lists what to carry
    over.
    """
    __tablename__ = "drill_plans"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    exercise_name = Column(String(200), nullable=True)   # also the ICS-213 incident name
    exercise_when = Column(String(200), nullable=True)   # "Saturday, October 24, 2026, 0800 to 1200"
    location = Column(String(200), nullable=True)
    purpose = Column(Text, nullable=True)
    scenario = Column(Text, nullable=True)
    # What stations announce at the start, during and end of every net, and
    # what formal messages say: "This is an exercise".
    announcement = Column(Text, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    net = relationship("Net", back_populates="drill_plan")
    objectives = relationship("DrillObjective", back_populates="plan", cascade="all, delete-orphan",
                              order_by="DrillObjective.sort_order")
    events = relationship("DrillEvent", back_populates="plan", cascade="all, delete-orphan",
                          order_by="DrillEvent.sort_order")


class DrillObjective(Base):
    """One numbered objective, grouped under a heading such as
    "Cumberland County (CDEMA - WS1EC)", with the rating it earned."""
    __tablename__ = "drill_objectives"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("drill_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    heading = Column(String(200), nullable=True)
    text = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    rating = Column(String(1), nullable=True)            # a DRILL_OBJECTIVE_RATINGS key
    result_note = Column(Text, nullable=True)

    plan = relationship("DrillPlan", back_populates="objectives")


class DrillEvent(Base):
    """One row of the schedule of events, in the columns ARES exercise
    plans use (and HSEEP's master scenario events list): time, initiator,
    receiver, type, method, event, expected actions.

    A row with a prepared message holds ICS-213 field values in `message`.
    Sending it files a real drill Form (form_id), so it is tracked through
    the existing chain of custody and reaches the ICS-309 like any traffic;
    the row's status is read from that form, never stored here.
    """
    __tablename__ = "drill_events"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("drill_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    time_label = Column(String(40), nullable=True)       # "09:15", "Upon FINEX"
    initiator = Column(String(120), nullable=True)
    receiver = Column(String(120), nullable=True)
    event_type = Column(String(40), nullable=True)       # Control, Message, Admin...
    method = Column(String(80), nullable=True)           # "2m simplex", "HF Winlink"
    description = Column(Text, nullable=True)
    expected_actions = Column(Text, nullable=True)
    # The site whose packet this row goes in, and which sends its message.
    # Null = every site.
    site_id = Column(Integer, ForeignKey("coverage_sites.id", ondelete="SET NULL"), nullable=True, index=True)
    message = Column(Text, nullable=True)                # JSON ICS-213 field values
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="SET NULL"), nullable=True, index=True)

    plan = relationship("DrillPlan", back_populates="events")
    site = relationship("CoverageSite")
    form = relationship("Form")


class Ics214Form(Base):
    """What net control changed on a net's ICS-214 Activity Log
    (services/ics214.py renders the rest from what was logged). One per net.

    Every header column is null while it is the default the service works
    out (the net's name, its times, the credited NCS), so a default that
    changes, such as a corrected start time, still reaches the form. The edit
    maps hide or reword lines and resources by their key; manual lines are
    ActivityEntry rows, never stored here. Nothing here records an issued
    copy: that belongs to the Incident Log (docs/ROADMAP.md).
    """
    __tablename__ = "ics214_forms"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    incident_name = Column(String(200), nullable=True)      # block 1
    period_from = Column(DateTime(timezone=True), nullable=True)  # block 2
    period_to = Column(DateTime(timezone=True), nullable=True)
    unit_name = Column(String(200), nullable=True)          # block 3
    leader = Column(String(200), nullable=True)             # block 4
    home_agency = Column(String(200), nullable=True)        # block 5
    prepared_name = Column(String(200), nullable=True)      # block 8
    prepared_position = Column(String(200), nullable=True)
    # JSON: {line key: {"hidden": bool, "text": str or null}}
    line_edits = Column(Text, nullable=False, default='{}')
    # JSON: {CALLSIGN: {"hidden": bool, "name", "position", "agency": str or null}}
    resource_edits = Column(Text, nullable=False, default='{}')
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ActivityEntry(Base):
    """Something the unit did that nobody logged on the air, written by
    hand: a briefing, a site setup, a supply run. A line on the ICS-214.

    Not the admin activity log (AuditEvent). The Incident Log will write
    these too and give them an incident, so net_id is optional from the
    start: an incident can have no net (docs/ROADMAP.md, "Incident log").
    """
    __tablename__ = "activity_entries"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=True, index=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    text = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StationChannelMark(Base):
    """A channel a station had at one place, marked offline by net control:
    its radio failed, the repeater went down, the operator left the HF desk.
    The channel is never removed from the station's row (Brad, 2026-10-30:
    "the site is still reachable there"), only greyed out with the time, and
    can be brought back. One row per time it went offline; restored_at closes
    it, and marking it offline again starts a new row, so the history stays.

    Keyed by station_key (services/station_place.py::station_place_key), the
    station at that place, not by check-in row: a station has a row per
    channel it rechecked on there (migration 098)."""
    __tablename__ = "station_channel_marks"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    station_key = Column(String(200), nullable=False)
    frequency_id = Column(Integer, ForeignKey("frequencies.id", ondelete="CASCADE"), nullable=False)
    offline_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    offline_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    restored_at = Column(DateTime(timezone=True), nullable=True)
    restored_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class CanHearReport(Base):
    """Directional 'can hear' propagation edge: reporter_check_in can hear heard_check_in.

    One row per checked box in the "Who can this station hear?" dialog.
    Data model: directional edges, no header table, reconcile-on-save -- the
    per-net report is the single source of truth and any coverage summary is a
    read-time rollup over these rows, never a second maintained table. The
    roadmap item carrying that rationale was pruned when the feature shipped;
    the Teams-dependent half of it lives in
    docs/concepts/TEAM-MANAGEMENT-NOTES.md section 5.6.
    """
    __tablename__ = "can_hear_reports"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_check_in_id = Column(Integer, ForeignKey("check_ins.id", ondelete="CASCADE"), nullable=False)
    heard_check_in_id = Column(Integer, ForeignKey("check_ins.id", ondelete="CASCADE"), nullable=False, index=True)
    frequency_id = Column(Integer, ForeignKey("frequencies.id"), nullable=True)
    reported_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reported_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('reporter_check_in_id', 'heard_check_in_id', 'frequency_id', name='uq_can_hear_report'),
    )

    net = relationship("Net", back_populates="can_hear_reports")
    reporter_check_in = relationship("CheckIn", foreign_keys=[reporter_check_in_id], back_populates="can_hear_reports_as_reporter")
    heard_check_in = relationship("CheckIn", foreign_keys=[heard_check_in_id], back_populates="can_hear_reports_as_heard")
    reported_by = relationship("User")


class FormDefinition(Base):
    """A form type available on this instance. Builtins are seeded and upserted
    from backend/app/traffic/definitions/*.json at startup, keyed on form_type.
    Admins may enable/disable, reorder, and override labels; they may not change
    a builtin's field set. See TRAFFIC-HANDLING-DESIGN.md D1."""
    __tablename__ = "form_definitions"

    id = Column(Integer, primary_key=True, index=True)
    form_type = Column(String(32), unique=True, index=True, nullable=False)   # "RADIOGRAM", "ICS213"
    title = Column(String(120), nullable=False)                               # "ARRL Radiogram"
    description = Column(Text)
    version = Column(String(16), nullable=False)                              # "3.1", from manifest.json
    output_format = Column(String(32), nullable=False, default='generic')     # "nts_radiogram" | "generic"
    is_builtin = Column(Boolean, default=True)      # field set is code-owned and not editable
    is_enabled = Column(Boolean, default=True)      # admin toggle, per instance
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    fields = relationship(
        "FormDefinitionField",
        back_populates="definition",
        cascade="all, delete-orphan",
        order_by="FormDefinitionField.sort_order",
    )
    forms = relationship("Form", back_populates="definition")


class FormDefinitionField(Base):
    """One row per field in a definition. Ported one-for-one from the .frm
    field objects; this is the roadmap's FormField and it belongs on the
    template side, not the value side."""
    __tablename__ = "form_definition_fields"

    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey("form_definitions.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    name = Column(String(64), nullable=False)        # "to_city_state" — stable key into Form.field_values
    label = Column(String(120), nullable=False)      # admin-overridable display label
    field_type = Column(String(20), nullable=False, default='text')  # text|textarea|choice|yesno
    description = Column(Text)                       # admin-overridable helper text
    help_text = Column(Text)                         # multi-line help (the HX code list)
    is_required = Column(Boolean, default=False)
    max_length = Column(Integer, nullable=True)
    choices = Column(Text, nullable=True)            # JSON array for field_type == 'choice'
    validator = Column(String(32), nullable=True)    # "callsign" | "us_zip" | "hhmm" | "city_state" | "phone" | "email" | "nts_number" | "hx_code"
    default_now = Column(String(16), nullable=True)  # strftime format for auto-fill, e.g. "%H%M"
    auto_fill = Column(String(32), nullable=True)    # "callsign" | "place_of_origin" | "signature"
    nts_normalize = Column(Boolean, default=False)   # run normalize_nts_text + count_nts_check on this field
    arl_enabled = Column(Boolean, default=False)     # offer the ARL numbered-message picker
    starts_new_section = Column(Boolean, default=False)  # RRI "/ /" break before this field (dynamic strip types only)
    sort_order = Column(Integer, default=100)

    definition = relationship("FormDefinition", back_populates="fields")

    __table_args__ = (
        UniqueConstraint('definition_id', 'name', name='uq_form_definition_field_name'),
    )


class Form(Base):
    """A submitted form instance (a piece of formal traffic). Values live in
    field_values as JSON; the columns below are promoted because they are
    filtered, sorted, or reported on. Disposition is NOT stored — it is derived
    from traffic_log_entries. See TRAFFIC-HANDLING-DESIGN.md D2 and D7."""
    __tablename__ = "forms"

    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey("form_definitions.id"), nullable=False)
    form_type = Column(String(32), nullable=False, index=True)     # denormalized for cheap filtering
    definition_version = Column(String(16), nullable=False)        # version in force at submit time

    # Association — nullable so a form can be filed outside any net
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # All field values, keyed by FormDefinitionField.name. Includes "text_raw"
    # (what the operator typed, pre-normalization) for radiograms.
    field_values = Column(Text, nullable=False, default='{}')

    # ---- Promoted columns (see D2) ----
    subject = Column(String(255))                  # one-line list label, computed at write
    addressee_display = Column(String(255))        # "JIM KUTSCH KY2D" / "PORTLAND ME"
    message_number = Column(String(16), index=True)
    precedence = Column(String(16), index=True)    # "R"|"W"|"P"|"E" for radiogram; ICS-213 word otherwise
    handling = Column(String(32))                  # HX codes, e.g. "HXD" or "HXB48"
    station_of_origin = Column(String(20), index=True)
    check_count = Column(Integer, nullable=True)   # computed by count_nts_check, authoritative
    check_stated = Column(Integer, nullable=True)  # what an imported text claimed; null when we originated
    normalized_text = Column(Text)                 # post-normalize_nts_text body, authoritative for export

    # None = real traffic. See TrafficTestCategory for DRILL vs DEMO semantics.
    test_category = Column(Enum(TrafficTestCategory), nullable=True, index=True)

    # ---- Derived-and-cached (single writer: app/traffic/log.py::append_entry) ----
    held_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                             nullable=True, index=True)
    held_since = Column(DateTime(timezone=True), nullable=True)
    last_action = Column(Enum(TrafficAction), nullable=True)   # drives disposition without a join

    filed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    definition = relationship("FormDefinition", back_populates="forms")
    net = relationship("Net", back_populates="forms")
    created_by = relationship("User", foreign_keys=[created_by_id])
    held_by = relationship("User", foreign_keys=[held_by_user_id])
    log_entries = relationship(
        "TrafficLogEntry",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="TrafficLogEntry.sequence",
    )

    __table_args__ = (
        Index('ix_forms_inbox', 'held_by_user_id', 'held_since'),
        Index('ix_forms_net_filed', 'net_id', 'filed_at'),
    )


class TrafficLogEntry(Base):
    """One hop in a form's chain of custody. Append-only; corrections are made by
    appending, not rewriting. Disposition is derived from the newest non-SERVICED
    entry. See TRAFFIC-HANDLING-DESIGN.md D7."""
    __tablename__ = "traffic_log_entries"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    sequence = Column(Integer, nullable=False)          # 1-based position in the chain
    action = Column(Enum(TrafficAction), nullable=False)

    # How it moved. Null for ORIGINATED and for SERVICED annotations.
    method = Column(Enum(RelayMethod), nullable=True)
    method_note = Column(String(255), nullable=True)    # required when method == OTHER
    path_name = Column(String(200), nullable=True)      # free text: "Pine Tree Net", "NTSD MPG"

    # Who it went to. Free text is the common case; the FK is set only when the
    # receiving operator is a known account on this instance, and is what moves
    # the item into their inbox.
    handed_to = Column(String(200), nullable=True)
    handed_to_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                               nullable=True, index=True)

    # Who actually performed this hop (took the message). Free text, distinct
    # from reported_by_user_id below: the common case is the entering operator
    # logging their own action, but e.g. an NCS often logs a hop a relay
    # station reported verbally over the net -- handled_by records that
    # station, while reported_by_user_id still records the NCS as whoever
    # entered it. Purely descriptive; does not feed held_by_user_id.
    handled_by = Column(String(200), nullable=True)

    # Who asserted this entry (i.e. who is logged into ECTLogger entering it).
    # Always the current user server-side, never client-supplied -- this is an
    # audit column, not a claim about who did the work (see handled_by above).
    reported_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                                 nullable=True, index=True)
    # The net this hop happened on, when it was an ECTLogger-logged net.
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="SET NULL"), nullable=True, index=True)

    note = Column(Text, nullable=True)                  # free-form operator note
    occurred_at = Column(DateTime(timezone=True), nullable=False)   # when it happened (operator-editable)
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # when it was recorded

    form = relationship("Form", back_populates="log_entries")
    handed_to_user = relationship("User", foreign_keys=[handed_to_user_id])
    reported_by = relationship("User", foreign_keys=[reported_by_user_id])
    net = relationship("Net")

    __table_args__ = (
        UniqueConstraint('form_id', 'sequence', name='uq_traffic_log_form_sequence'),
    )


class TrafficReminderLog(Base):
    """Dedup log for the traffic reminder ladder (D4).

    Modeled directly on WhatsNewSendLog's cross-process atomic-insert lock:
    the UniqueConstraint(form_id, user_id, stage) is what prevents two
    processes/ticks from sending the same reminder stage to the same holder
    twice. Whichever process INSERTs first wins; the second gets an
    IntegrityError and skips the send. See
    docs/concepts/TRAFFIC-HANDLING-DESIGN.md D4 and
    app/traffic_reminder_service.py.
    """
    __tablename__ = "traffic_reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(Integer, nullable=False)   # 1-based ladder stage (or HXB override stage)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    form = relationship("Form")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint('form_id', 'user_id', 'stage', name='uq_traffic_reminder_log_form_user_stage'),
    )


class CustomField(Base):
    __tablename__ = "custom_fields"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    field_type = Column(String(50), nullable=False)  # text, number, textarea, select
    options = Column(Text)  # JSON string for select options
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    created_by = relationship("User")
    values = relationship("CustomFieldValue", back_populates="field", cascade="all, delete-orphan")


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"))
    check_in_id = Column(Integer, ForeignKey("check_ins.id", ondelete="CASCADE"), nullable=True)
    field_id = Column(Integer, ForeignKey("custom_fields.id"))
    value = Column(Text)
    is_required = Column(Boolean, default=False)

    # Relationships
    net = relationship("Net", back_populates="custom_field_values")
    check_in = relationship("CheckIn", back_populates="custom_values")
    field = relationship("CustomField", back_populates="values")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Null for system messages
    message = Column(Text, nullable=False)
    is_system = Column(Boolean, default=False)  # True for activity messages (check-in, check-out, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Overwrite-only edit: the text is replaced in place and this stamps when.
    # No version history table on purpose -- a net log wants the corrected
    # wording, not an audit trail of typos.
    edited_at = Column(DateTime(timezone=True), nullable=True)
    # JSON list of user ids this message @mentions, resolved against the net's
    # checked-in roster when the message is sent or edited. Same JSON-as-Text
    # pattern as CheckIn.custom_fields.
    mentioned_user_ids = Column(Text, nullable=True)
    # Signal-style quote reply (one level, no threads). SET NULL so deleting
    # the quoted message leaves the reply readable instead of cascading it
    # away, though SQLite does not enforce this without PRAGMA foreign_keys,
    # so the serializers treat a missing parent as "no quote block".
    reply_to_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    net = relationship("Net", back_populates="chat_messages")
    user = relationship("User", back_populates="chat_messages")
    reply_to = relationship("ChatMessage", remote_side=[id], foreign_keys=[reply_to_message_id])
    reactions = relationship("ChatReaction", back_populates="message", cascade="all, delete-orphan")
    images = relationship("ChatImage", back_populates="message", cascade="all, delete-orphan")


class ChatReaction(Base):
    __tablename__ = "chat_reactions"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_chat_reaction'),
    )

    message = relationship("ChatMessage", back_populates="reactions")
    user = relationship("User")


class ChatImage(Base):
    __tablename__ = "chat_images"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    image_path = Column(String(500), nullable=False)
    thumb_path = Column(String(500), nullable=False)
    mime_type = Column(String(50), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    message = relationship("ChatMessage", back_populates="images")
    user = relationship("User")
    net = relationship("Net")


class ChatMute(Base):
    """A viewer's personal chat mute of another station, scoped to one net.
    Hides the muted station's messages from the muter's own view only -- no
    other viewer, and not the exported net log, is affected. See ChatNetMute
    below for the net-wide, staff-applied counterpart."""
    __tablename__ = "chat_mutes"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False)
    muter_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    muted_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('net_id', 'muter_user_id', 'muted_user_id', name='uq_chat_mute'),
    )

    net = relationship("Net")
    muter = relationship("User", foreign_keys=[muter_user_id])
    muted = relationship("User", foreign_keys=[muted_user_id])


class NetBlock(Base):
    """A station net control removed from one net and barred from checking
    itself back in (routers/net_blocks.py). Matched by callsign, and by
    account when the station has one, so a blocked operator can't return
    under another of their callsigns. Net control can still check the
    station in by hand. Scoped to one net: the schedule's next net starts
    clean, like ChatNetMute, which blocking also applies."""
    __tablename__ = "net_blocks"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    callsign = Column(String(20), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    blocked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('net_id', 'callsign', name='uq_net_block'),
    )

    blocked_by = relationship("User", foreign_keys=[blocked_by_user_id])


class ChatNetMute(Base):
    """A net-wide chat mute applied by NCS/Logger staff, scoped to one net.
    Unlike ChatMute this is a single row per (net, muted user) rather than
    per-viewer -- it's a moderation action, not a personal preference, so any
    active NCS/Logger can see it and lift it, not just whoever applied it.
    Hides the muted station's messages live for every viewer (staff and
    non-staff alike), same as ChatMute; never touches the stored messages
    table, so the net's chat log/export is unaffected. Does not persist past
    this net -- a recurring template's next occurrence starts clean."""
    __tablename__ = "chat_net_mutes"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False)
    muted_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    applied_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('net_id', 'muted_user_id', name='uq_chat_net_mute'),
    )

    net = relationship("Net")
    muted = relationship("User", foreign_keys=[muted_user_id])
    applied_by = relationship("User", foreign_keys=[applied_by_user_id])


class FieldDefinition(Base):
    """Admin-defined check-in fields that can be enabled per-net"""
    __tablename__ = "field_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # Internal name (e.g., "skywarn_number")
    label = Column(String(100), nullable=False)  # Display label (e.g., "Spotter #")
    field_type = Column(String(20), default='text')  # text, textarea, number, select
    options = Column(Text)  # JSON array for select options
    placeholder = Column(String(200))  # Placeholder text for input
    default_enabled = Column(Boolean, default=False)  # Enabled by default for new nets
    default_required = Column(Boolean, default=False)  # Required by default for new nets
    # On by default: rejects a submitted value that looks like a URL or email
    # address for this field (routers/check_ins.py's create/update guard).
    # Meant for freeform fields (Location, Notes, ...) that were never meant
    # to carry a link -- an admin can turn this off for a field deliberately
    # meant to hold one. See app/utils.py::looks_like_email_or_url.
    spam_guard_enabled = Column(Boolean, nullable=False, default=True)
    is_builtin = Column(Boolean, default=False)  # True for system fields (name, location, etc.)
    is_archived = Column(Boolean, default=False)  # Archived fields are hidden but data preserved
    sort_order = Column(Integer, default=100)  # Display order
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TemplateStaff(Base):
    """NCS staff who can run nets from a template (separate from rotation).

    A row names either an account (user_id) or, for an operator who has not
    signed up yet, a callsign alone (user_id NULL, callsign set). A
    callsign-only row grants nothing: every permission check compares
    user_id to the signed-in account, and NULL never matches. It becomes an
    ordinary row when that callsign's operator signs up (see
    services/callsign_people.py::claim_callsign_placeholders).
    """
    __tablename__ = "template_staff"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    callsign = Column(String(50), nullable=True)  # Set only while user_id is NULL
    is_active = Column(Boolean, default=True)  # Can be temporarily disabled
    is_co_manager = Column(Boolean, default=False)  # Elevated role within staff
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    template = relationship("NetTemplate", back_populates="staff")
    user = relationship("User")

    # Unique constraint - each user can only be staff once per template
    __table_args__ = (
        UniqueConstraint('template_id', 'user_id', name='uq_template_staff_template_user'),
    )


class NCSRotationMember(Base):
    """Members in an NCS rotation for a net template.

    Names an account or, like TemplateStaff, a callsign with no account yet.
    """
    __tablename__ = "ncs_rotation_members"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    callsign = Column(String(50), nullable=True)  # Set only while user_id is NULL
    position = Column(Integer, nullable=False)  # Order in rotation (1, 2, 3, etc.)
    is_active = Column(Boolean, default=True)  # Can be temporarily disabled
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    template = relationship("NetTemplate", back_populates="rotation_members")
    user = relationship("User")


class NCSScheduleOverride(Base):
    """Override/swap for a specific date in the NCS rotation"""
    __tablename__ = "ncs_schedule_overrides"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    scheduled_date = Column(DateTime(timezone=True), nullable=False)  # The date being overridden
    original_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Who was originally scheduled
    replacement_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Who is taking over (NULL with no replacement_callsign = cancelled)
    # The same two people when they have no account yet (callsign only).
    original_callsign = Column(String(50), nullable=True)
    replacement_callsign = Column(String(50), nullable=True)
    reason = Column(String(500))  # Optional reason for the swap
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    template = relationship("NetTemplate", back_populates="schedule_overrides")
    original_user = relationship("User", foreign_keys=[original_user_id])
    replacement_user = relationship("User", foreign_keys=[replacement_user_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


class NetCallsignRole(Base):
    """An NCS, Logger or Relay credit on a net for a station with no account.

    Kept out of net_roles on purpose. Some 160 lines of code read NetRole to
    decide who may do what, and the frontend matches a role to a check-in by
    user_id, where a guest row's NULL would equal a NULL role's. A separate
    table means no existing permission check or role lookup can ever see one
    of these: they only credit the station (the report, ICS-309, net cards)
    and show its badge. When the callsign's operator signs up, the row becomes
    a real NetRole (services/callsign_people.py).
    """
    __tablename__ = "net_callsign_roles"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"), nullable=False, index=True)
    callsign = Column(String(50), nullable=False)
    role = Column(String(50), nullable=False)  # NCS, LOGGER, RELAY
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    # Same meaning as NetRole.auto_assigned: stamped from the rotation at
    # auto-create time, so a roster edit may replace it.
    auto_assigned = Column(Boolean, default=False, nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    net = relationship("Net")

    __table_args__ = (
        UniqueConstraint('net_id', 'callsign', 'role', name='uq_net_callsign_role'),
    )


class CallsignClaim(Base):
    """An account and one schedule's callsign-only entries for its callsign.

    Per schedule, because a claim is only trusted per schedule: an account
    takes the entries over by itself only when it signed in with the address
    that schedule's manager invited the callsign at (TeamInvite). Otherwise
    the claim is "held" (rows empty) until a manager of that schedule links
    it, and the held row is what keeps the manager from being emailed about
    it again on every profile save.

    A "linked" claim records every row it converted so it can be undone
    exactly: an admin who finds someone signed up with a callsign that is not
    theirs reverts it (banning reverts all of them). `rows` is a JSON list of
    {"table", "id", "action"} where action is "linked" (user_id set on the
    row) or "merged" (the account already had an equivalent row, so the
    callsign-only one was deleted; "data" then holds what to recreate).
    See services/callsign_people.py.
    """
    __tablename__ = "callsign_claims"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    callsign = Column(String(50), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=True, index=True)
    # "linked" (entries converted) or "held" (waiting for a manager).
    status = Column(String(20), nullable=False, default="linked")
    rows = Column(Text, nullable=False, default='[]')
    # True when the account signed in with the address this schedule invited.
    via_invite = Column(Boolean, nullable=False, default=False)
    # The manager or admin who linked a held claim by hand, if one did.
    linked_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    claimed_at = Column(DateTime(timezone=True), server_default=func.now())
    reverted_at = Column(DateTime(timezone=True), nullable=True)
    reverted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    reverted_by = relationship("User", foreign_keys=[reverted_by_id])


class TeamInvite(Base):
    """One sign-up invite a schedule manager sent for a callsign-only entry.

    The send log, and the only proof a claim is the invited operator: an
    account signed in with `email` takes over `callsign`'s entries on
    `template_id` by itself, and only there (the latest invite for that
    schedule and callsign wins). Every send is a row, so a re-send counts
    toward the inviter's and the recipient's daily limits. An invite is used
    up (`used_at`) once that schedule's entries for the callsign are linked
    to an account, so it can't vouch for a later account at the same address
    (say, after an admin deletes the first one).
    """
    __tablename__ = "team_invites"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    callsign = Column(String(50), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    invited_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    sent_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)


class NCSReminderLog(Base):
    """Track sent NCS reminders to prevent duplicates"""
    __tablename__ = "ncs_reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scheduled_date = Column(DateTime(timezone=True), nullable=False)
    reminder_type = Column(String(20), nullable=False)  # '24_hour' or '1_hour'
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    template = relationship("NetTemplate")
    user = relationship("User")


class WhatsNewSendLog(Base):
    """Track sent What's New digest emails for cross-process deduplication.

    The UNIQUE constraint on (user_id, sent_date) is the atomic lock that
    prevents two uvicorn processes from sending the same day's digest to
    the same user.  Whichever process INSERTs first wins; the second gets
    an IntegrityError and skips the send.
    """
    __tablename__ = "whats_new_send_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sent_date = Column(String(10), nullable=False)   # ISO date, e.g. "2026-05-09"
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'sent_date', name='uq_whats_new_send_log_user_date'),
    )

    user = relationship("User")


class Contact(Base):
    """Known station contacts built from check-in history.
    
    Auto-populated when a callsign checks in for the first time.
    Admin can edit to fix names, add emails, and send invites.
    When a contact creates an account, their user_id links here.
    """
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    callsign = Column(String(50), unique=True, index=True, nullable=False)  # Primary identifier
    name = Column(String(255))  # Operator name (may be corrected by admin)
    location = Column(String(255))  # Home QTH / default location
    email = Column(String(255))  # For sending invites
    skywarn_number = Column(String(50))
    notes = Column(Text)  # Admin notes about this contact
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Linked user account
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", foreign_keys=[user_id])


class AuditEvent(Base):
    """The activity log: one row per security- or moderation-relevant action,
    readable by admins only (Admin > Activity, routers/audit.py). Written by
    app/audit.py::record_event in the same transaction as the change it
    describes, so a rolled-back change leaves no event and the reverse.

    Every reference is copied as a label as well as an id, because the thing
    acted on is often gone (a deleted net, a deleted account) and SQLite
    reuses the highest id after a delete. Deleting an account clears its ids
    here and keeps the labels (routers/users.py::delete_user), so a new
    account given the same id never inherits this history.

    ip and user_agent are personal data under GDPR and are blanked after
    AUDIT_IP_RETENTION_DAYS; the row itself is pruned after
    AUDIT_RETENTION_DAYS (app/audit.py). Replaced admin_audit_log
    (migration 088 copied its rows in)."""
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    action = Column(String(64), nullable=False, index=True)  # e.g. "net.deleted", see app/audit.py
    # Who did it. Null actor_user_id with a label: a failed sign-in, or a
    # deleted account. Null both: the system (a scheduled job).
    actor_user_id = Column(Integer, nullable=True, index=True)
    actor_label = Column(String(255), nullable=True)
    ip = Column(String(64), nullable=True, index=True)
    user_agent = Column(String(255), nullable=True)
    # Where the address was at the time, from the local GeoIP file
    # (app/geoip.py): "City, Region, CC". Cleared along with ip.
    location = Column(String(120), nullable=True)
    # What it was done to.
    target_type = Column(String(32), nullable=True)  # user, net, schedule, check_in, chat_message, ...
    target_id = Column(Integer, nullable=True)
    target_label = Column(String(255), nullable=True)
    # The person it was about, when that isn't the actor (an admin banning
    # someone, NCS deleting a station's check-in). "Show activity" for a user
    # matches actor_user_id or subject_user_id.
    subject_user_id = Column(Integer, nullable=True, index=True)
    net_id = Column(Integer, nullable=True, index=True)
    template_id = Column(Integer, nullable=True, index=True)
    details = Column(Text, nullable=True)  # JSON: {"changes": {field: [old, new]}, ...}


class AppSettings(Base):
    """Global application settings - singleton table with one row"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    # Default field configuration for new nets
    default_field_config = Column(Text, default='{"name": {"enabled": true, "required": false, "label": "Name"}, "location": {"enabled": true, "required": false, "label": "Location"}, "skywarn_number": {"enabled": false, "required": false, "label": "Spotter #"}, "weather_observation": {"enabled": false, "required": false, "label": "Weather"}, "power_source": {"enabled": false, "required": false, "label": "Power Src"}, "power": {"enabled": false, "required": false, "label": "Power"}, "feedback": {"enabled": false, "required": false, "label": "Feedback"}, "notes": {"enabled": false, "required": false, "label": "Notes"}}')
    # Field labels (for display across the app)
    field_labels = Column(Text, default='{"name": "Name", "location": "Location", "skywarn_number": "Spotter #", "weather_observation": "Weather", "power_source": "Power Src", "power": "Power", "feedback": "Feedback", "notes": "Notes"}')
    
    # Schedule creation limits (anti-abuse)
    schedule_min_account_age_days = Column(Integer, default=7)  # Minimum days since account creation
    schedule_min_net_participations = Column(Integer, default=1)  # Minimum net check-ins
    schedule_max_per_day = Column(Integer, default=5)  # Maximum schedules per day

    # Session / authentication settings
    session_lifetime_days = Column(Integer, default=90)  # JWT lifetime in days
    session_rolling_renewal = Column(Boolean, default=True)  # Auto-refresh when < 7 days remain

    # Theming
    default_theme = Column(String(32), default='ectlogger-blue')  # System-wide default theme key for users with no personal preference

    # Branding
    default_color_mode = Column(String(5), default='light')  # 'light' or 'dark' - only affects a browser's very first visit
    custom_theme_json = Column(Text, nullable=True)  # Admin-defined instance theme: {name, light: {...}, dark: {...}}
    custom_logo_url = Column(String(255), nullable=True)  # Uploaded logo path, replaces the built-in SVG mark when set

    # Maintenance banner (in-app, DB-backed)
    maintenance_banner_enabled = Column(Boolean, default=False)
    maintenance_banner_message = Column(Text, nullable=True)
    maintenance_banner_dismissible = Column(Boolean, default=True)
    # When set, banner is only active within this window (null = always active when enabled)
    maintenance_banner_scheduled_start = Column(DateTime(timezone=True), nullable=True)
    maintenance_banner_scheduled_end = Column(DateTime(timezone=True), nullable=True)

    # Assisted Traffic Handling
    traffic_reminder_enabled = Column(Boolean, default=True)  # Master switch for the precedence-scaled reminder ladder (D4)

    # Avatars. When false, no Gravatar URL is ever handed to a client, so no
    # browser contacts gravatar.com -- for self-hosted instances on isolated
    # or privacy-restricted networks (EOC, hospital, agency). Uploaded profile
    # photos are unaffected; only the third-party lookup is disabled.
    gravatar_enabled = Column(Boolean, default=True)

    # Security alerts (app/security_alerts.py). Failed sign-ins email the
    # account's owner and every admin; a wrong two-factor code alerts on
    # the first one, since it means the password was right. Being muted by
    # this many different people emails admins only.
    signin_alert_enabled = Column(Boolean, default=True)
    signin_alert_threshold = Column(Integer, default=5)
    signin_alert_window_minutes = Column(Integer, default=15)
    mute_alert_enabled = Column(Boolean, default=True)
    mute_alert_threshold = Column(Integer, default=3)
    mute_alert_window_days = Column(Integer, default=30)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ========== BACKUPS ==========
# See app/backup/ and docs/DEVELOPMENT.md "Backups". Kept out of AppSettings
# because these rows hold key material and credentials, which must never ride
# along on the general GET /settings response.

class BackupSettings(Base):
    """Backup schedule, retention and key - singleton table with one row (id=1)."""
    __tablename__ = "backup_settings"

    id = Column(Integer, primary_key=True, default=1)
    enabled = Column(Boolean, nullable=False, default=False)
    enabled_at = Column(DateTime(timezone=True), nullable=True)  # last switched on; the overdue clock starts here
    # 'daily' runs once a day at daily_time in schedule_timezone;
    # 'interval' runs every interval_hours after the last successful backup.
    schedule_mode = Column(String(16), nullable=False, default="daily")
    daily_time = Column(String(5), nullable=False, default="03:00")  # HH:MM
    schedule_timezone = Column(String(64), nullable=False, default="UTC")  # IANA name
    interval_hours = Column(Integer, nullable=False, default=24)
    # Local retention (newest per day / ISO week / month -- see backup/retention.py)
    keep_daily = Column(Integer, nullable=False, default=7)
    keep_weekly = Column(Integer, nullable=False, default=4)
    keep_monthly = Column(Integer, nullable=False, default=6)
    notify_on_failure = Column(Boolean, nullable=False, default=True)
    # Encryption key (backup/keys.py). The passphrase itself is never stored:
    # only the age public key, and the private key wrapped by the passphrase.
    key_recipient = Column(String(100), nullable=True)
    key_wrapped_identity = Column(Text, nullable=True)  # base64 of the age passphrase file
    key_fingerprint = Column(String(16), nullable=True)
    key_created_at = Column(DateTime(timezone=True), nullable=True)
    # Heartbeat from whatever runs run-if-due, so the admin panel can tell
    # "no backup is due" apart from "nothing is checking".
    last_scheduler_check_at = Column(DateTime(timezone=True), nullable=True)
    # Set when the "no successful backup lately" email goes out, cleared by the
    # next success, so that alert is sent once rather than on every check.
    overdue_alert_sent_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class BackupTarget(Base):
    """An off-site destination every backup is copied to."""
    __tablename__ = "backup_targets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    kind = Column(String(16), nullable=False)  # 'sftp' | 's3'
    enabled = Column(Boolean, nullable=False, default=True)
    # Non-secret connection details as JSON: sftp {host, port, username, path},
    # s3 {endpoint_url, region, bucket, prefix, access_key_id}.
    config_json = Column(Text, nullable=False, default="{}")
    # SFTP private key or S3 secret key, Fernet-encrypted (backup/targets.py).
    secret_encrypted = Column(Text, nullable=True)
    # SFTP only: the server host key an admin confirmed, "type base64".
    trusted_host_key = Column(Text, nullable=True)
    # Delete old backups on this target by the same retention rule as local.
    # Off by default: a drop point that sweeps uploads away should be pruned
    # by its own server, and a server that can delete off-site copies is
    # exactly what an attacker on this one would want.
    prune_enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class BackupRun(Base):
    """One backup attempt, scheduled or manual, and how each target fared."""
    __tablename__ = "backup_runs"

    id = Column(Integer, primary_key=True, index=True)
    trigger = Column(String(16), nullable=False)  # 'scheduled' | 'manual'
    triggered_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # 'running' | 'success' | 'partial' (built, but a target failed) | 'failed'
    status = Column(String(16), nullable=False, default="running", index=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    filename = Column(String(100), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    sha256 = Column(String(64), nullable=True)
    key_fingerprint = Column(String(16), nullable=True)
    # JSON list: [{target_id, name, ok, message}]
    target_results = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    # Filled in by "Verify": when it was last decrypted and checked, and the result.
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verify_ok = Column(Boolean, nullable=True)
    verify_detail = Column(Text, nullable=True)

    triggered_by = relationship("User", foreign_keys=[triggered_by_id])


class UserEmail(Base):
    """A backup sign-in address for an account (migration 092). The primary
    address stays on User.email and is where everything is sent; a backup
    only signs in and gets security notices, so losing the primary mailbox
    doesn't lock anyone out. Rows exist only once confirmed (the pending
    state is the emailed link itself), or after an admin merge.

    One address belongs to one account across both User.email and this
    table: services/account_email.py::email_owner is the check, since no
    database constraint spans two tables. Find an account by address with
    services/account_email.py::find_user_by_email, never User.email alone.
    """
    __tablename__ = "user_emails"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)  # normalized (app.utils.normalize_email)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TrainingSession(Base):
    """A scheduled training session an admin posted (routers/training.py,
    migration 095), listed in the top bar's Help > Training dialog until it is
    over. Times are naive UTC like every other stored instant (see
    DEVELOPMENT.md "Date & Time Handling"); the browser converts them. The
    online link is withheld from signed-out visitors by the router. Account
    merge picks created_by_id up by its foreign key."""
    __tablename__ = "training_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=True)
    location = Column(String(300), nullable=True)
    online_url = Column(String(500), nullable=True)
    details = Column(Text, nullable=True)  # Markdown
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TrainingBannerDismissal(Base):
    """A signed-in user closed the training banner for one session
    (components/TrainingBanner.tsx, routers/training.py, migration 096). Saved
    per account so a dismissed announcement stays gone on every device (Brad,
    2026-10-30: "I don't want to hound my users"). A row is only useful until
    its session is over, so the router deletes it then, and with its session.
    Account merge picks it up by its foreign key and drops a duplicate via the
    unique constraint."""
    __tablename__ = "training_banner_dismissals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id", ondelete="CASCADE"), nullable=False)
    dismissed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'session_id', name='uq_training_banner_dismissal'),
    )
