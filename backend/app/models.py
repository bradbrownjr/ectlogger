from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Table
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
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"


class StationStatus(str, enum.Enum):
    CHECKED_IN = "checked_in"
    AVAILABLE = "available"
    LISTENING = "listening"
    AWAY = "away"
    CHECKED_OUT = "checked_out"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255))
    callsign = Column(String(50), unique=True, index=True)  # Primary callsign for backward compatibility
    callsigns = Column(Text, default='[]')  # JSON array of all callsigns
    role = Column(Enum(UserRole), default=UserRole.USER)
    oauth_provider = Column(String(50))  # google, microsoft, github, email
    oauth_id = Column(String(255), unique=True, index=True)
    is_active = Column(Boolean, default=True)
    email_notifications = Column(Boolean, default=True)
    sms_gateway = Column(String(255))  # email-to-sms gateway address
    skywarn_number = Column(String(50))
    location = Column(String(255))
    prefer_utc = Column(Boolean, default=False)  # Display times in UTC instead of local time
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owned_nets = relationship("Net", back_populates="owner", foreign_keys="Net.owner_id")
    owned_templates = relationship("NetTemplate", back_populates="owner")
    template_subscriptions = relationship("NetTemplateSubscription", back_populates="user")
    check_ins = relationship("CheckIn", back_populates="user", foreign_keys="CheckIn.user_id")
    chat_messages = relationship("ChatMessage", back_populates="user")


class Net(Base):
    __tablename__ = "nets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(Enum(NetStatus), default=NetStatus.DRAFT)
    owner_id = Column(Integer, ForeignKey("users.id"))
    active_frequency_id = Column(Integer, ForeignKey("frequencies.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("net_templates.id"), nullable=True)
    field_config = Column(Text, default='{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}')  # JSON config for check-in fields
    started_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", back_populates="owned_nets", foreign_keys=[owner_id])
    template = relationship("NetTemplate", back_populates="nets", foreign_keys=[template_id])
    frequencies = relationship("Frequency", secondary=net_frequencies, back_populates="nets")
    active_frequency = relationship("Frequency", foreign_keys=[active_frequency_id])
    check_ins = relationship("CheckIn", back_populates="net", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="net", cascade="all, delete-orphan")
    net_roles = relationship("NetRole", back_populates="net", cascade="all, delete-orphan")
    custom_field_values = relationship("CustomFieldValue", back_populates="net", cascade="all, delete-orphan")


class NetTemplate(Base):
    __tablename__ = "net_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"))
    field_config = Column(Text, default='{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}')
    is_active = Column(Boolean, default=True)
    
    # Schedule configuration
    schedule_type = Column(String(20), default='ad_hoc')  # ad_hoc, daily, weekly, monthly
    schedule_config = Column(Text, default='{}')  # JSON: {day_of_week: 0-6, week_of_month: 1-5, time: "18:00"}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", back_populates="owned_templates")
    frequencies = relationship("Frequency", secondary=net_template_frequencies)
    subscriptions = relationship("NetTemplateSubscription", back_populates="template", cascade="all, delete-orphan")
    nets = relationship("Net", back_populates="template")


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


class NetRole(Base):
    __tablename__ = "net_roles"

    id = Column(Integer, primary_key=True, index=True)
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String(50), nullable=False)  # NCS, LOGGER, RELAY
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    net = relationship("Net", back_populates="net_roles")
    user = relationship("User")


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
    feedback = Column(Text)
    notes = Column(Text)
    
    # Status and tracking
    status = Column(Enum(StationStatus), default=StationStatus.CHECKED_IN)
    frequency_id = Column(Integer, ForeignKey("frequencies.id"))  # Frequency they checked in on
    available_frequencies = Column(Text, default='[]')  # JSON array of frequency IDs they can reach
    is_recheck = Column(Boolean, default=False)
    checked_in_by_id = Column(Integer, ForeignKey("users.id"))  # Who logged this check-in
    
    checked_in_at = Column(DateTime(timezone=True), server_default=func.now())
    checked_out_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    net = relationship("Net", back_populates="check_ins")
    user = relationship("User", foreign_keys=[user_id], back_populates="check_ins")
    checked_in_by = relationship("User", foreign_keys=[checked_in_by_id])
    frequency = relationship("Frequency")
    custom_values = relationship("CustomFieldValue", back_populates="check_in", cascade="all, delete-orphan")


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
    user_id = Column(Integer, ForeignKey("users.id"))
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    net = relationship("Net", back_populates="chat_messages")
    user = relationship("User", back_populates="chat_messages")
