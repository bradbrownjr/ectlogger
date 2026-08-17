from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Table, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


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


class StationStatus(str, enum.Enum):
    CHECKED_IN = "checked_in"
    HAS_TRAFFIC = "has_traffic"
    LISTENING = "listening"
    RELAY = "relay"
    AWAY = "away"
    ANNOUNCEMENTS = "announcements"
    MOBILE = "mobile"
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


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255))
    callsign = Column(String(50), unique=True, index=True)  # Primary callsign (Amateur Radio)
    gmrs_callsign = Column(String(50), unique=True, index=True, nullable=True)  # GMRS callsign (e.g., WROP123)
    callsigns = Column(Text, default='[]')  # JSON array of additional callsigns
    previous_callsigns = Column(Text, default='[]')  # JSON array of former primary callsigns (auto-populated on callsign change)
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
    prefer_utc = Column(Boolean, default=False)  # Display times in UTC instead of local time
    last_active = Column(DateTime(timezone=True), index=True)  # Last API request timestamp for online tracking
    schedule_age_bypass = Column(Boolean, default=False)  # Admin-granted early access to schedule creation
    walkthrough_seen = Column(Boolean, default=False)  # Set true after user dismisses the onboarding walkthrough
    avatar_url = Column(String(500), nullable=True)  # Custom profile image URL; overrides Gravatar when set
    dashboard_sort_order = Column(String(16), nullable=False, default='status', server_default='status')  # 'status' (active first, then next up) or 'alpha'
    schedule_sort_order = Column(String(16), nullable=False, default='date', server_default='date')  # 'date' (next occurrence first) or 'alpha'
    theme = Column(String(32), nullable=True)  # Named color theme key; null = follow system default
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
    script = Column(Text)  # Net script for NCS to follow during net operations
    announcements = Column(Text)  # General traffic/announcements for NCS to reference during net
    status = Column(Enum(NetStatus), default=NetStatus.DRAFT)
    owner_id = Column(Integer, ForeignKey("users.id"))
    active_frequency_id = Column(Integer, ForeignKey("frequencies.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("net_templates.id"), nullable=True)
    field_config = Column(Text, default='{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "power": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}')  # JSON config for check-in fields
    ics309_enabled = Column(Boolean, default=False)  # Generate ICS-309 format on close
    propagation_logging_enabled = Column(Boolean, default=False)  # Enable "can hear" station-to-station coverage logging
    self_can_hear_enabled = Column(Boolean, default=True)  # If False, only NCS/logger/relay may record "can hear" reports; regular stations can't self-report
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

    # Auto-open lobby: minutes before scheduled_start_time that the scheduler
    # moves this net to LOBBY on its own. Null = disabled (the default). Copied
    # from the template at auto-create time; the per-net value is authoritative
    # so an NCS can switch it off for a single occurrence.
    auto_lobby_minutes = Column(Integer, nullable=True)
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
    forms = relationship("Form", back_populates="net")   # no cascade: traffic outlives the net


class NetTemplate(Base):
    __tablename__ = "net_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    info_url = Column(String(500))  # URL for net, club, or organization info
    stream_url = Column(String(500))  # Audio stream URL (Shoutcast, Broadcastify, etc.) - default for nets created from this schedule
    script = Column(Text)  # Net script template
    announcements = Column(Text)  # Default announcements/traffic carried forward to nets created from this schedule
    owner_id = Column(Integer, ForeignKey("users.id"))
    fifth_week_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    field_config = Column(Text, default='{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "power": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}')
    is_active = Column(Boolean, default=True)
    ics309_enabled = Column(Boolean, default=False)  # Enable ICS-309 format for net close emails
    propagation_logging_enabled = Column(Boolean, default=False)  # Seeds Net.propagation_logging_enabled for nets created from this template
    self_can_hear_enabled = Column(Boolean, default=True)  # Seeds Net.self_can_hear_enabled for nets created from this template
    traffic_enabled = Column(Boolean, default=False)  # Seeds Net.traffic_enabled for nets created from this template
    # Seed the three per-net traffic settings above; same null semantics.
    traffic_form_types = Column(Text, nullable=True)
    traffic_strip_form_type = Column(String(32), nullable=True)
    traffic_strip_template = Column(Text, nullable=True)
    traffic_escalation_digest = Column(Boolean, default=False)  # Opt-in weekly stale-traffic digest to this template's manager (D4). Off by default -- a badge in the traffic panel is the default escalation path; this is for groups that need active chasing.
    mobile_priority_sort = Column(Boolean, default=True)  # Promote mobile stations above chronological order
    chat_grace_period_minutes = Column(Integer, nullable=True)  # Minutes to keep chat open after close; null = disabled
    self_checkin_enabled = Column(Boolean, default=True)  # If False, nets from this schedule accept only NCS/logger-entered check-ins
    # Default auto-open-lobby offset for nets created from this schedule, in
    # minutes before the scheduled start. Null = disabled (the default).
    auto_lobby_minutes = Column(Integer, nullable=True)

    # Topic of the Week / Poll features for community nets
    topic_of_week_enabled = Column(Boolean, default=False)
    topic_of_week_prompt = Column(String(500))  # Default topic question for nets from this template
    poll_enabled = Column(Boolean, default=False)
    poll_question = Column(String(500))  # Default poll question for nets from this template
    
    # Schedule configuration
    schedule_type = Column(String(20), default='ad_hoc')  # ad_hoc, daily, weekly, monthly
    schedule_config = Column(Text, default='{}')  # JSON: {day_of_week: 0-6, week_of_month: 1-5, time: "18:00"}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", back_populates="owned_templates", foreign_keys=[owner_id])
    fifth_week_user = relationship("User", foreign_keys=[fifth_week_user_id])
    frequencies = relationship("Frequency", secondary=net_template_frequencies)
    subscriptions = relationship("NetTemplateSubscription", back_populates="template", cascade="all, delete-orphan")
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


class Frequency(Base):
    __tablename__ = "frequencies"

    id = Column(Integer, primary_key=True, index=True)
    frequency = Column(String(50), nullable=True)  # e.g., "146.520 MHz" (optional for digital modes)
    mode = Column(String(50), nullable=False)  # e.g., "FM", "SSB", "DMR", "YSF", "D-STAR"
    network = Column(String(100), nullable=True)  # e.g., "Wires-X", "Brandmeister", "REF030C"
    talkgroup = Column(String(50), nullable=True)  # e.g., "31665", "Room 12345"
    description = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

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

    checked_in_at = Column(DateTime(timezone=True), server_default=func.now())
    checked_out_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    net = relationship("Net", back_populates="check_ins")
    user = relationship("User", foreign_keys=[user_id], back_populates="check_ins")
    checked_in_by = relationship("User", foreign_keys=[checked_in_by_id])
    frequency = relationship("Frequency")
    parent_check_in = relationship("CheckIn", remote_side="CheckIn.id", foreign_keys=[parent_check_in_id])
    custom_values = relationship("CustomFieldValue", back_populates="check_in", cascade="all, delete-orphan")
    can_hear_reports_as_reporter = relationship(
        "CanHearReport", foreign_keys="CanHearReport.reporter_check_in_id",
        back_populates="reporter_check_in", cascade="all, delete-orphan"
    )
    can_hear_reports_as_heard = relationship(
        "CanHearReport", foreign_keys="CanHearReport.heard_check_in_id",
        back_populates="heard_check_in", cascade="all, delete-orphan"
    )


class CanHearReport(Base):
    """Directional 'can hear' propagation edge: reporter_check_in can hear heard_check_in.

    One row per checked box in the "Who can this station hear?" dialog. See
    docs/ROADMAP.md "Relaying & Propagation Mapping" for the full data model
    rationale (directional edges, no header table, reconcile-on-save).
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

    # Relationships
    net = relationship("Net", back_populates="chat_messages")
    user = relationship("User", back_populates="chat_messages")
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
    is_builtin = Column(Boolean, default=False)  # True for system fields (name, location, etc.)
    is_archived = Column(Boolean, default=False)  # Archived fields are hidden but data preserved
    sort_order = Column(Integer, default=100)  # Display order
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TemplateStaff(Base):
    """NCS staff who can run nets from a template (separate from rotation)"""
    __tablename__ = "template_staff"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
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
    """Members in an NCS rotation for a net template"""
    __tablename__ = "ncs_rotation_members"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("net_templates.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
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
    replacement_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Who is taking over (NULL = cancelled)
    reason = Column(String(500))  # Optional reason for the swap
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    template = relationship("NetTemplate", back_populates="schedule_overrides")
    original_user = relationship("User", foreign_keys=[original_user_id])
    replacement_user = relationship("User", foreign_keys=[replacement_user_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


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
    user = relationship("User")


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

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
