from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Literal, Dict, Any, Union
from datetime import datetime
from app.models import UserRole, NetStatus, StationStatus, FormDisposition, TrafficAction, RelayMethod
import re


# Named theme keys, mirrored from frontend/src/theme/themes.ts. Kept as a
# plain tuple (not an Enum) so adding a theme only requires touching that
# one frontend file plus this list, not a schema migration.
# 'custom' is always accepted even if no admin-defined custom theme exists
# yet (Admin -> Branding) - selecting it before one is configured just
# falls back to the default theme on the frontend until an admin sets one.
VALID_THEME_KEYS = ('ectlogger-blue', 'ocean', 'forest', 'sunset', 'berry', 'custom')


def public_display_name(name: Optional[str], is_authenticated: bool) -> Optional[str]:
    """Reduce a display name for unauthenticated callers.

    Authenticated users see the full name. Guests see only the first token
    (typically the first name) so callsign + first name are visible without
    exposing surnames or other PII. Returns None unchanged.
    """
    if not name or is_authenticated:
        return name
    first = name.strip().split()
    return first[0] if first else None


# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(None, max_length=100, min_length=1)
    callsign: Optional[str] = Field(None, max_length=20, min_length=3, pattern=r'^[A-Z0-9/]+$')
    callsigns: Optional[List[str]] = Field(default_factory=list)
    role: UserRole = UserRole.USER
    
    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v
    
    @field_validator('callsigns')
    @classmethod
    def validate_callsigns(cls, v: Optional[List[str]]) -> List[str]:
        if v:
            for callsign in v:
                if callsign and not re.match(r'^[A-Z0-9/]+$', callsign):
                    raise ValueError(f'Callsign {callsign} must contain only uppercase letters, numbers, and forward slashes')
        return v or []


class UserCreate(UserBase):
    oauth_provider: str
    oauth_id: str


class AdminUserCreate(BaseModel):
    """Schema for admin to create/invite a user"""
    email: EmailStr
    name: Optional[str] = Field(None, max_length=100)
    callsign: Optional[str] = Field(None, max_length=20, pattern=r'^[A-Z0-9/]+$')
    role: UserRole = UserRole.USER
    
    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100, min_length=1)
    callsign: Optional[str] = Field(None, max_length=20, min_length=3)
    gmrs_callsign: Optional[str] = Field(None, max_length=20)
    callsigns: Optional[List[str]] = None
    email_notifications: Optional[bool] = None
    notify_net_start: Optional[bool] = None
    notify_net_close: Optional[bool] = None
    notify_net_reminder: Optional[bool] = None
    notify_ics309: Optional[bool] = None
    notify_whats_new: Optional[bool] = None
    timezone: Optional[str] = Field(None, max_length=64)
    show_activity_in_chat: Optional[bool] = None
    location_awareness: Optional[bool] = None
    sms_gateway: Optional[str] = Field(None, max_length=100)
    skywarn_number: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    prefer_utc: Optional[bool] = None
    walkthrough_seen: Optional[bool] = None
    dashboard_sort_order: Optional[Literal['status', 'alpha']] = None
    schedule_sort_order: Optional[Literal['alpha', 'date']] = None
    theme: Optional[str] = Field(None, max_length=32)  # Null = follow system default

    @model_validator(mode='before')
    @classmethod
    def empty_strings_to_none(cls, values: dict) -> dict:
        # Unique-constrained columns must store NULL rather than "" so that
        # multiple users without a value don't collide on the unique index.
        for field in ('callsign', 'gmrs_callsign'):
            if values.get(field) == '':
                values[field] = None
        return values

    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v
    
    @field_validator('callsigns')
    @classmethod
    def validate_callsigns(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v:
            for callsign in v:
                if callsign and not re.match(r'^[A-Z0-9/]+$', callsign):
                    raise ValueError(f'Callsign {callsign} must contain only uppercase letters, numbers, and forward slashes')
        return v

    @field_validator('timezone')
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            from zoneinfo import available_timezones
            if v not in available_timezones():
                raise ValueError(f'"{v}" is not a valid IANA timezone')
        return v

    @field_validator('theme')
    @classmethod
    def validate_theme(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_THEME_KEYS:
            raise ValueError(f'"{v}" is not a recognized theme')
        return v


class UserResponse(UserBase):
    id: int
    is_active: bool
    email_notifications: bool
    notify_net_start: bool = True
    notify_net_close: bool = True
    notify_net_reminder: bool = False
    notify_ics309: bool = False
    notify_whats_new: bool = False
    timezone: Optional[str] = None
    show_activity_in_chat: bool = True
    location_awareness: bool = False
    gmrs_callsign: Optional[str] = None
    skywarn_number: Optional[str] = None
    location: Optional[str] = None
    prefer_utc: bool = False
    walkthrough_seen: bool = False
    dashboard_sort_order: str = 'status'
    schedule_sort_order: str = 'date'
    theme: Optional[str] = None
    previous_callsigns: List[str] = Field(default_factory=list)
    last_active: Optional[datetime] = None
    schedule_age_bypass: bool = False
    # Whether this user has ever held the NCS role on any net. Computed live by
    # list_users() via an EXISTS subquery - not a real column on User, so it
    # always defaults to False when a UserResponse is built from a bare User
    # (e.g. /users/me). Only the admin users list (GET /users) sets it.
    is_ncs: bool = False
    created_at: datetime
    live_location: Optional[str] = None
    live_location_updated: Optional[datetime] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        import json
        from app.utils import get_avatar_url
        # Deserialize callsigns JSON field
        if hasattr(obj, 'callsigns') and obj.callsigns:
            try:
                obj.callsigns = json.loads(obj.callsigns) if isinstance(obj.callsigns, str) else obj.callsigns
            except (json.JSONDecodeError, TypeError):
                obj.callsigns = []
        else:
            obj.callsigns = []
        # Deserialize previous_callsigns JSON field
        if hasattr(obj, 'previous_callsigns') and obj.previous_callsigns:
            try:
                obj.previous_callsigns = json.loads(obj.previous_callsigns) if isinstance(obj.previous_callsigns, str) else obj.previous_callsigns
            except (json.JSONDecodeError, TypeError):
                obj.previous_callsigns = []
        else:
            obj.previous_callsigns = []
        # Compute avatar URL (Gravatar or custom upload)
        obj.avatar_url = get_avatar_url(
            getattr(obj, 'email', None),
            getattr(obj, 'avatar_url', None),
        )
        return super().from_orm(obj)


# Directory entry — minimal user info for staff/rotation pickers and
# any authenticated UI that needs to display "who is who" by callsign.
# Intentionally excludes email, role, last_active, notification prefs, etc.
class UserDirectoryEntry(BaseModel):
    """Minimal user info for authenticated user pickers (staff/rotation/etc.)."""
    id: int
    callsign: Optional[str] = None
    name: Optional[str] = None  # full display name; pickers render `CALLSIGN (Name)`

    class Config:
        from_attributes = True


# Callsign Lookup Response (limited info for privacy)
class CallsignLookupResponse(BaseModel):
    """Limited user info returned when looking up by callsign - for NCS auto-fill.
    Source indicates where the data came from: 'user', 'contact', or None if unknown.
    """
    name: Optional[str] = None
    location: Optional[str] = None  # Grid square if location_awareness enabled
    skywarn_number: Optional[str] = None
    source: Optional[str] = None  # 'user' or 'contact' — helps NCS know data origin

    class Config:
        from_attributes = True


# Contact Schemas (station contacts from check-in history)
class ContactBase(BaseModel):
    callsign: str = Field(max_length=50, min_length=2, pattern=r'^[A-Z0-9/]+$')
    name: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    skywarn_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None

    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: str) -> str:
        if not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    """All fields optional for partial updates."""
    callsign: Optional[str] = Field(None, max_length=50, pattern=r'^[A-Z0-9/]+$')
    name: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    skywarn_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None

    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v


class ContactResponse(ContactBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# User Popup ("Who is this?") Schemas
class PopupNetEntry(BaseModel):
    net_id: int
    net_name: str
    date: Optional[datetime] = None
    check_in_count: int = 0


class UserPopupResponse(BaseModel):
    user_id: int
    callsign: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    net_role: Optional[str] = None
    total_check_ins: int = 0
    unique_nets: int = 0
    recent_nets: List[PopupNetEntry] = []
    top_nets: List[PopupNetEntry] = []


# Frequency Schemas
class FrequencyBase(BaseModel):
    frequency: Optional[str] = Field(None, max_length=50)
    mode: str = Field(max_length=20, pattern=r'^(FM|AM|SSB|USB|LSB|CW|DIGITAL|DMR|D-STAR|FUSION|YSF|P25|GMRS)$')
    network: Optional[str] = Field(None, max_length=100)  # e.g., "Wires-X", "Brandmeister", "REF030C"
    talkgroup: Optional[str] = Field(None, max_length=50)  # e.g., "31665", "Room 12345"
    description: Optional[str] = Field(None, max_length=500)


class FrequencyCreate(FrequencyBase):
    @model_validator(mode='after')
    def validate_freq_or_network(self):
        """Ensure either frequency or network is provided."""
        if not self.frequency and not self.network:
            raise ValueError('Either frequency or network must be provided')
        return self


class FrequencyResponse(FrequencyBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class FrequencyWithUsageResponse(FrequencyBase):
    """Frequency response with net usage count for admin view"""
    id: int
    created_at: datetime
    net_count: int = 0

    class Config:
        from_attributes = True


# traffic_form_types is stored as a JSON array in a TEXT column on both nets
# and net_templates (migration 056) but travels the API as a real list. Shared
# by NetResponse.from_orm and NetTemplateResponse.from_orm so the two can't
# drift. Tolerates junk rather than 500ing a whole net fetch over one column.
def _parse_traffic_form_types(raw) -> Optional[List[str]]:
    if not raw:
        return None
    if isinstance(raw, list):
        return raw
    import json
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, list) else None


# Net Schemas
class NetBase(BaseModel):
    name: str = Field(max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    info_url: Optional[str] = Field(None, max_length=500)
    stream_url: Optional[str] = Field(None, max_length=500)
    script: Optional[str] = Field(None, max_length=50000)
    announcements: Optional[str] = Field(None, max_length=50000)
    field_config: Optional[dict] = None
    ics309_enabled: Optional[bool] = False
    propagation_logging_enabled: Optional[bool] = False
    # Opt-in, matching the two EmComm toggles above. Nets created before the
    # settings toggle existed keep their stored True -- see migration 056.
    traffic_enabled: Optional[bool] = False
    # Form types this net takes; null/empty = every enabled definition.
    traffic_form_types: Optional[List[str]] = Field(None, max_length=50)
    # Either a defined RRI/WX strip type, or a raw pasted origin strip whose
    # fields are then positional. Both optional and independent.
    traffic_strip_form_type: Optional[str] = Field(None, max_length=32)
    traffic_strip_template: Optional[str] = Field(None, max_length=10000)
    mobile_priority_sort: Optional[bool] = True
    chat_grace_period_minutes: Optional[int] = None
    self_checkin_enabled: Optional[bool] = True
    # Minutes before the scheduled start to auto-open the lobby; null = disabled
    auto_lobby_minutes: Optional[int] = Field(None, ge=0, le=1440)
    # Topic of the Week / Poll features
    topic_of_week_enabled: Optional[bool] = False
    topic_of_week_prompt: Optional[str] = Field(None, max_length=500)
    poll_enabled: Optional[bool] = False
    poll_question: Optional[str] = Field(None, max_length=500)
    # Scheduled start time for countdown display
    scheduled_start_time: Optional[datetime] = None


class NetCreate(NetBase):
    frequency_ids: List[int] = []


class NetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    info_url: Optional[str] = Field(None, max_length=500)
    stream_url: Optional[str] = Field(None, max_length=500)
    script: Optional[str] = Field(None, max_length=50000)
    announcements: Optional[str] = Field(None, max_length=50000)
    status: Optional[NetStatus] = None
    active_frequency_id: Optional[int] = None
    frequency_ids: Optional[List[int]] = Field(None, max_length=50)
    field_config: Optional[dict] = None
    ics309_enabled: Optional[bool] = None
    propagation_logging_enabled: Optional[bool] = None
    traffic_enabled: Optional[bool] = None
    traffic_form_types: Optional[List[str]] = Field(None, max_length=50)
    traffic_strip_form_type: Optional[str] = Field(None, max_length=32)
    traffic_strip_template: Optional[str] = Field(None, max_length=10000)
    mobile_priority_sort: Optional[bool] = None
    chat_grace_period_minutes: Optional[int] = None
    self_checkin_enabled: Optional[bool] = None
    auto_lobby_minutes: Optional[int] = Field(None, ge=0, le=1440)
    # Topic of the Week / Poll features
    topic_of_week_enabled: Optional[bool] = None
    topic_of_week_prompt: Optional[str] = Field(None, max_length=500)
    poll_enabled: Optional[bool] = None
    poll_question: Optional[str] = Field(None, max_length=500)
    # Scheduled start time for countdown display
    scheduled_start_time: Optional[datetime] = None
    # Allow NCS/admin to adjust actual start/end timestamps
    started_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    
    @field_validator('frequency_ids')
    @classmethod
    def validate_frequency_ids(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v and len(v) > 50:
            raise ValueError('Maximum 50 frequencies allowed per net')
        return v


class NetResponse(NetBase):
    id: int
    status: NetStatus
    owner_id: int
    owner_callsign: Optional[str] = None
    owner_name: Optional[str] = None
    # Currently-assigned Net Control Station for this net (most recently
    # added user with NetRole.role == "NCS"). May differ from the owner
    # (the "Net Manager"), since the manager is whoever created/owns the
    # net while the NCS is whoever is actually running it on the air.
    ncs_callsign: Optional[str] = None
    ncs_name: Optional[str] = None
    template_id: Optional[int] = None  # ID of the template this net was created from
    active_frequency_id: Optional[int] = None
    field_config: Optional[dict] = None
    ics309_enabled: bool = False
    propagation_logging_enabled: bool = False
    traffic_enabled: bool = True
    traffic_form_types: Optional[List[str]] = None
    traffic_strip_form_type: Optional[str] = None
    traffic_strip_template: Optional[str] = None
    scheduled_start_time: Optional[datetime] = None
    started_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    # Set while the net has an assigned NCS but none are actively present
    # (all away/not checked in); null otherwise. total_paused_seconds
    # accumulates each past paused window and is folded in at close.
    paused_at: Optional[datetime] = None
    total_paused_seconds: int = 0
    frequencies: List[FrequencyResponse] = []
    check_in_count: Optional[int] = None
    can_manage: bool = False  # True if current user can edit (owner, admin, or NCS)
    is_owner_or_ncs: bool = False  # True if user has non-admin access (owner/NCS/staff) — used by admin simulation mode
    user_attended: Optional[bool] = None  # True if current user checked into this net
    user_ran: Optional[bool] = None       # True if current user owned/ran this net

    @classmethod
    def from_orm(cls, net, owner_callsign: str = None, owner_name: str = None, check_in_count: int = None, can_manage: bool = False, is_owner_or_ncs: bool = False, ncs_callsign: str = None, ncs_name: str = None, user_attended: bool = None, user_ran: bool = None):
        import json
        data = {
            'id': net.id,
            'name': net.name,
            'description': net.description,
            'info_url': net.info_url,
            'stream_url': net.stream_url,
            'script': net.script,
            'announcements': net.announcements,
            'status': net.status,
            'owner_id': net.owner_id,
            'owner_callsign': owner_callsign,
            'owner_name': owner_name,
            'ncs_callsign': ncs_callsign,
            'ncs_name': ncs_name,
            'template_id': net.template_id,
            'active_frequency_id': net.active_frequency_id,
            'field_config': json.loads(net.field_config) if net.field_config else None,
            'ics309_enabled': net.ics309_enabled or False,
            'propagation_logging_enabled': net.propagation_logging_enabled or False,
            'traffic_enabled': net.traffic_enabled if net.traffic_enabled is not None else True,
            'traffic_form_types': _parse_traffic_form_types(net.traffic_form_types),
            'traffic_strip_form_type': net.traffic_strip_form_type,
            'traffic_strip_template': net.traffic_strip_template,
            'mobile_priority_sort': net.mobile_priority_sort if net.mobile_priority_sort is not None else True,
            'chat_grace_period_minutes': net.chat_grace_period_minutes,
            'self_checkin_enabled': net.self_checkin_enabled if net.self_checkin_enabled is not None else True,
            'auto_lobby_minutes': net.auto_lobby_minutes,
            'topic_of_week_enabled': net.topic_of_week_enabled or False,
            'topic_of_week_prompt': net.topic_of_week_prompt,
            'poll_enabled': net.poll_enabled or False,
            'poll_question': net.poll_question,
            'scheduled_start_time': net.scheduled_start_time,
            'started_at': net.started_at,
            'closed_at': net.closed_at,
            'created_at': net.created_at,
            'paused_at': net.paused_at,
            'total_paused_seconds': net.total_paused_seconds or 0,
            'frequencies': [FrequencyResponse.model_validate(f) for f in net.frequencies],
            'check_in_count': check_in_count,
            'can_manage': can_manage,
            'is_owner_or_ncs': is_owner_or_ncs,
            'user_attended': user_attended,
            'user_ran': user_ran,
        }
        return cls(**data)

    class Config:
        from_attributes = True


# Net Template Schemas
class NetTemplateBase(BaseModel):
    name: str = Field(max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    info_url: Optional[str] = Field(None, max_length=500)
    stream_url: Optional[str] = Field(None, max_length=500)  # Default audio stream URL for nets created from this schedule
    script: Optional[str] = None  # Net script template
    announcements: Optional[str] = None  # Default announcements/traffic carried into nets from this schedule
    field_config: Optional[dict] = None
    schedule_type: Optional[str] = Field(default='ad_hoc')  # ad_hoc, daily, weekly, monthly
    schedule_config: Optional[dict] = Field(default_factory=dict)  # {day_of_week, week_of_month, time}
    fifth_week_user_id: Optional[int] = None
    ics309_enabled: bool = False  # Enable ICS-309 format for net close emails
    propagation_logging_enabled: bool = False  # Seeds propagation_logging_enabled for nets created from this template
    traffic_enabled: bool = False  # Seeds traffic_enabled for nets created from this template
    # Seed the three per-net traffic settings; same null semantics as NetBase.
    traffic_form_types: Optional[List[str]] = Field(None, max_length=50)
    traffic_strip_form_type: Optional[str] = Field(None, max_length=32)
    traffic_strip_template: Optional[str] = Field(None, max_length=10000)
    mobile_priority_sort: Optional[bool] = True
    chat_grace_period_minutes: Optional[int] = None
    self_checkin_enabled: Optional[bool] = True
    # Default minutes before the scheduled start to auto-open the lobby for nets
    # created from this schedule; null = disabled
    auto_lobby_minutes: Optional[int] = Field(None, ge=0, le=1440)
    # Topic of the Week / Poll features
    topic_of_week_enabled: Optional[bool] = False
    topic_of_week_prompt: Optional[str] = Field(None, max_length=500)
    poll_enabled: Optional[bool] = False
    poll_question: Optional[str] = Field(None, max_length=500)


class NetTemplateCreate(NetTemplateBase):
    frequency_ids: Optional[List[int]] = []
    owner_id: Optional[int] = None  # Admin can assign to another user


class NetTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    info_url: Optional[str] = Field(None, max_length=500)
    stream_url: Optional[str] = Field(None, max_length=500)
    script: Optional[str] = None
    announcements: Optional[str] = None
    field_config: Optional[dict] = None
    frequency_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None
    schedule_type: Optional[str] = None
    schedule_config: Optional[dict] = None
    fifth_week_user_id: Optional[int] = None
    owner_id: Optional[int] = None  # Allow changing the owner (admin only or current owner)
    ics309_enabled: Optional[bool] = None
    propagation_logging_enabled: Optional[bool] = None
    traffic_enabled: Optional[bool] = None
    traffic_form_types: Optional[List[str]] = Field(None, max_length=50)
    traffic_strip_form_type: Optional[str] = Field(None, max_length=32)
    traffic_strip_template: Optional[str] = Field(None, max_length=10000)
    mobile_priority_sort: Optional[bool] = None
    chat_grace_period_minutes: Optional[int] = None
    self_checkin_enabled: Optional[bool] = None
    auto_lobby_minutes: Optional[int] = Field(None, ge=0, le=1440)
    # Topic of the Week / Poll features
    topic_of_week_enabled: Optional[bool] = None
    topic_of_week_prompt: Optional[str] = Field(None, max_length=500)
    poll_enabled: Optional[bool] = None
    poll_question: Optional[str] = Field(None, max_length=500)


class NetTemplateResponse(NetTemplateBase):
    id: int
    owner_id: int
    owner_callsign: Optional[str] = None
    owner_name: Optional[str] = None
    fifth_week_user_callsign: Optional[str] = None
    fifth_week_user_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    frequencies: List[FrequencyResponse] = []
    subscriber_count: int = 0
    is_subscribed: bool = False
    can_manage: bool = False  # True if current user can edit this template
    can_create_net: bool = False  # True if current user can create a net from this template (admin, owner, or NCS staff)

    @classmethod
    def from_orm(cls, template, subscriber_count: int = 0, is_subscribed: bool = False, owner_callsign: str = None, owner_name: str = None, can_manage: bool = False, can_create_net: bool = False):
        import json
        data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'info_url': template.info_url,
            'stream_url': template.stream_url,
            'script': template.script,
            'announcements': template.announcements,
            'owner_id': template.owner_id,
            'owner_callsign': owner_callsign,
            'owner_name': owner_name,
            'fifth_week_user_id': template.fifth_week_user_id,
            'fifth_week_user_callsign': template.fifth_week_user.callsign if template.fifth_week_user else None,
            'fifth_week_user_name': template.fifth_week_user.name if template.fifth_week_user else None,
            'field_config': json.loads(template.field_config) if template.field_config else None,
            'schedule_type': template.schedule_type,
            'schedule_config': json.loads(template.schedule_config) if template.schedule_config else {},
            'ics309_enabled': template.ics309_enabled or False,
            'propagation_logging_enabled': template.propagation_logging_enabled or False,
            'traffic_enabled': template.traffic_enabled if template.traffic_enabled is not None else True,
            'traffic_form_types': _parse_traffic_form_types(template.traffic_form_types),
            'traffic_strip_form_type': template.traffic_strip_form_type,
            'traffic_strip_template': template.traffic_strip_template,
            'mobile_priority_sort': template.mobile_priority_sort if template.mobile_priority_sort is not None else True,
            'chat_grace_period_minutes': template.chat_grace_period_minutes,
            'self_checkin_enabled': template.self_checkin_enabled if template.self_checkin_enabled is not None else True,
            'auto_lobby_minutes': template.auto_lobby_minutes,
            'topic_of_week_enabled': template.topic_of_week_enabled or False,
            'topic_of_week_prompt': template.topic_of_week_prompt,
            'poll_enabled': template.poll_enabled or False,
            'poll_question': template.poll_question,
            'is_active': template.is_active,
            'created_at': template.created_at,
            'frequencies': [FrequencyResponse.model_validate(f) for f in template.frequencies],
            'subscriber_count': subscriber_count,
            'is_subscribed': is_subscribed,
            'can_manage': can_manage,
            'can_create_net': can_create_net
        }
        return cls(**data)

    class Config:
        from_attributes = True


class TemplateMergeRequest(BaseModel):
    """Request to merge multiple templates into a single target template"""
    target_template_id: int = Field(description="The template that will survive the merge")
    source_template_ids: List[int] = Field(min_length=1, description="Templates to merge into the target (will be deleted)")


class NetTemplateLinkRequest(BaseModel):
    """Request to attach (or detach) an existing net to a schedule/template"""
    template_id: Optional[int] = Field(None, description="Template to link this net to. Pass null to detach.")


class CreateNetFromTemplateRequest(BaseModel):
    """Optional override for the net's scheduled start time when creating from a template.

    Only meaningful for one-time schedules: daily/weekly/monthly templates compute
    their own next occurrence server-side, and ad-hoc templates have no start time
    at all. A one-time schedule has neither, so this is the only way to give its
    single net an official start time (and therefore an auto-lobby window).
    """
    scheduled_start_time: Optional[datetime] = None


class TemplateMergeConflict(BaseModel):
    """A field where the source template differs from the target"""
    field: str
    target_value: Optional[str] = None
    source_value: Optional[str] = None
    source_template_name: str


class TemplateMergePreview(BaseModel):
    """Preview of what a merge operation will do"""
    target_template_id: int
    target_template_name: str
    source_templates: List[dict]  # [{id, name, net_count, subscriber_count}]
    total_nets_moved: int
    total_subscribers_moved: int
    total_staff_moved: int
    total_rotation_members_moved: int
    conflicts: List[TemplateMergeConflict] = []


class TemplateMergeResponse(BaseModel):
    """Result of a merge operation"""
    target_template_id: int
    nets_moved: int
    subscribers_moved: int
    staff_moved: int
    rotation_members_moved: int
    templates_deleted: int


class NetTemplateSubscriptionResponse(BaseModel):
    id: int
    template_id: int
    user_id: int
    subscribed_at: datetime

    class Config:
        from_attributes = True


class NetTemplateSubscriptionDetailResponse(NetTemplateSubscriptionResponse):
    user_email: Optional[EmailStr] = None
    user_name: Optional[str] = None
    user_callsign: Optional[str] = None

    @classmethod
    def from_orm_with_user(cls, subscription):
        return cls(
            id=subscription.id,
            template_id=subscription.template_id,
            user_id=subscription.user_id,
            subscribed_at=subscription.subscribed_at,
            user_email=subscription.user.email if subscription.user else None,
            user_name=subscription.user.name if subscription.user else None,
            user_callsign=subscription.user.callsign if subscription.user else None,
        )


# CheckIn Schemas
class CheckInBase(BaseModel):
    callsign: str = Field(max_length=20, min_length=3, pattern=r'^[A-Z0-9/]+$')
    name: Optional[str] = Field(default='', max_length=100)
    location: Optional[str] = Field(default='', max_length=200)
    skywarn_number: Optional[str] = Field(None, max_length=50)
    weather_observation: Optional[str] = Field(None, max_length=2000)
    power_source: Optional[str] = Field(None, max_length=100)
    power: Optional[str] = Field(None, max_length=100)
    feedback: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=2000)
    relayed_by: Optional[str] = Field(None, max_length=50)
    operating_position: Optional[str] = Field(None, max_length=50)
    # Topic of the Week / Poll responses
    topic_response: Optional[str] = Field(None, max_length=2000)
    poll_response: Optional[str] = Field(None, max_length=255)

    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: str) -> str:
        if not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v


class CheckInCreate(CheckInBase):
    frequency_id: Optional[int] = None
    available_frequency_ids: Optional[List[int]] = Field(default_factory=list)
    custom_fields: Optional[dict] = Field(default_factory=dict, max_length=50)
    status: Optional[StationStatus] = None
    
    @field_validator('custom_fields')
    @classmethod
    def validate_custom_fields(cls, v: dict) -> dict:
        if not v:
            return v
        if len(v) > 50:
            raise ValueError('Maximum 50 custom fields allowed')
        for key, value in v.items():
            if not isinstance(key, str) or len(key) > 100:
                raise ValueError('Custom field keys must be strings with max 100 characters')
            if isinstance(value, str) and len(value) > 5000:
                raise ValueError('Custom field string values must be max 5000 characters')
            if not isinstance(value, (str, int, float, bool, type(None))):
                raise ValueError('Custom field values must be strings, numbers, booleans, or null')
        return v


class CheckInUpdate(BaseModel):
    callsign: Optional[str] = Field(None, max_length=50)
    name: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[StationStatus] = None
    skywarn_number: Optional[str] = Field(None, max_length=50)
    weather_observation: Optional[str] = Field(None, max_length=2000)
    power_source: Optional[str] = Field(None, max_length=100)
    power: Optional[str] = Field(None, max_length=100)
    feedback: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=2000)
    relayed_by: Optional[str] = Field(None, max_length=50)
    operating_position: Optional[str] = Field(None, max_length=50)
    available_frequency_ids: Optional[List[int]] = None
    custom_fields: Optional[dict] = None
    # Topic of the Week / Poll responses
    topic_response: Optional[str] = Field(None, max_length=2000)
    poll_response: Optional[str] = Field(None, max_length=255)
    hand_raised: Optional[bool] = None


class CheckInResponse(CheckInBase):
    id: int
    net_id: int
    user_id: Optional[int] = None
    status: StationStatus
    frequency_id: Optional[int] = None
    available_frequencies: List[int] = Field(default_factory=list)
    custom_fields: Optional[dict] = Field(default_factory=dict)
    hand_raised: bool = False
    is_recheck: bool
    parent_check_in_id: Optional[int] = None
    checked_in_by_id: Optional[int] = None
    checked_in_at: datetime
    checked_out_at: Optional[datetime] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        import json
        from app.utils import get_avatar_url
        # Deserialize available_frequencies JSON field
        if hasattr(obj, 'available_frequencies') and obj.available_frequencies:
            try:
                obj.available_frequencies = json.loads(obj.available_frequencies) if isinstance(obj.available_frequencies, str) else obj.available_frequencies
            except (json.JSONDecodeError, TypeError):
                obj.available_frequencies = []
        else:
            obj.available_frequencies = []
        # Deserialize custom_fields JSON field
        if hasattr(obj, 'custom_fields') and obj.custom_fields:
            try:
                obj.custom_fields = json.loads(obj.custom_fields) if isinstance(obj.custom_fields, str) else obj.custom_fields
            except (json.JSONDecodeError, TypeError):
                obj.custom_fields = {}
        else:
            obj.custom_fields = {}
        # Attach avatar from associated user (guests have no user, so None)
        if obj.user:
            obj.avatar_url = get_avatar_url(
                getattr(obj.user, 'email', None),
                getattr(obj.user, 'avatar_url', None),
            )
        else:
            obj.avatar_url = None
        return super().from_orm(obj)


# Custom Field Schemas
class CustomFieldBase(BaseModel):
    name: str = Field(max_length=100, min_length=1)
    field_type: str = Field(max_length=50, pattern=r'^(text|number|select|checkbox|radio|textarea|date|time)$')
    options: Optional[str] = Field(None, max_length=5000)


class CustomFieldCreate(CustomFieldBase):
    pass


class CustomFieldResponse(CustomFieldBase):
    id: int
    created_by_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Chat Message Schemas
class ChatMessageCreate(BaseModel):
    message: str = Field(max_length=5000, min_length=1)


class ChatImageUploadResponse(BaseModel):
    id: int
    image_url: str
    thumb_url: str
    width: int
    height: int
    size_bytes: int
    marker: str


class ChatMessageResponse(BaseModel):
    id: int
    net_id: int
    user_id: Optional[int] = None
    callsign: Optional[str] = None
    message: str
    is_system: bool = False
    created_at: datetime
    reactions: dict = {}  # emoji -> list of user_ids
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        from app.utils import get_avatar_url
        # Build reactions dict: emoji -> sorted list of user_ids
        reactions: dict = {}
        for r in (obj.reactions if hasattr(obj, 'reactions') and obj.reactions else []):
            reactions.setdefault(r.emoji, [])
            reactions[r.emoji].append(r.user_id)

        # Compute avatar URL from user relationship (None for system messages)
        avatar_url = None
        if obj.user and not (hasattr(obj, 'is_system') and obj.is_system):
            avatar_url = get_avatar_url(
                getattr(obj.user, 'email', None),
                getattr(obj.user, 'avatar_url', None),
            )

        # Include callsign from user relationship
        data = {
            'id': obj.id,
            'net_id': obj.net_id,
            'user_id': obj.user_id,
            'callsign': obj.user.callsign if obj.user and obj.user.callsign else ('System' if obj.is_system else 'Unknown'),
            'message': obj.message,
            'is_system': obj.is_system if hasattr(obj, 'is_system') else False,
            'created_at': obj.created_at,
            'reactions': reactions,
            'avatar_url': avatar_url,
        }
        return cls(**data)


# Authentication Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkVerify(BaseModel):
    token: str


# App Settings Schemas
class FieldConfigItem(BaseModel):
    enabled: bool = True
    required: bool = False
    label: Optional[str] = None


HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


class CustomThemeVariant(BaseModel):
    primary: str
    secondary: str
    background: str
    paper: str

    @field_validator('primary', 'secondary', 'background', 'paper')
    @classmethod
    def validate_hex(cls, v: str) -> str:
        if not HEX_COLOR_RE.match(v):
            raise ValueError(f'"{v}" is not a valid 6-digit hex color')
        return v


class CustomTheme(BaseModel):
    """Admin-defined instance theme (Admin -> Branding). A single site-wide
    slot, not per-user-created - mirrors frontend/src/theme/themes.ts's
    ThemeDefinition shape so it can be injected as a 6th swatch at runtime."""
    name: str = Field(default='Custom', max_length=50)
    light: CustomThemeVariant
    dark: CustomThemeVariant


class AppSettingsResponse(BaseModel):
    default_field_config: dict
    field_labels: dict
    # Schedule creation limits
    schedule_min_account_age_days: int = 7
    schedule_min_net_participations: int = 1
    schedule_max_per_day: int = 5
    # Session settings
    session_lifetime_days: int = 90
    session_rolling_renewal: bool = True
    # Maintenance banner
    maintenance_banner_enabled: bool = False
    maintenance_banner_message: Optional[str] = None
    maintenance_banner_dismissible: bool = True
    maintenance_banner_scheduled_start: Optional[datetime] = None
    maintenance_banner_scheduled_end: Optional[datetime] = None
    # Theming
    default_theme: str = 'ectlogger-blue'
    # Branding
    default_color_mode: Literal['light', 'dark'] = 'light'
    custom_theme: Optional[CustomTheme] = None
    custom_logo_url: Optional[str] = None

    class Config:
        from_attributes = True


class AppSettingsUpdate(BaseModel):
    default_field_config: Optional[dict] = None
    field_labels: Optional[dict] = None
    # Schedule creation limits
    schedule_min_account_age_days: Optional[int] = None
    schedule_min_net_participations: Optional[int] = None
    schedule_max_per_day: Optional[int] = None
    # Session settings
    session_lifetime_days: Optional[int] = None
    session_rolling_renewal: Optional[bool] = None
    # Maintenance banner
    maintenance_banner_enabled: Optional[bool] = None
    maintenance_banner_message: Optional[str] = None
    maintenance_banner_dismissible: Optional[bool] = None
    maintenance_banner_scheduled_start: Optional[datetime] = None
    maintenance_banner_scheduled_end: Optional[datetime] = None
    # Theming
    default_theme: Optional[str] = None
    # Branding (custom_logo_url is not settable here - it's only ever written
    # by the dedicated upload/delete endpoints in routers/settings.py, which
    # validate and save the actual file)
    default_color_mode: Optional[Literal['light', 'dark']] = None
    custom_theme: Optional[CustomTheme] = None

    @field_validator('default_theme')
    @classmethod
    def validate_default_theme(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_THEME_KEYS:
            raise ValueError(f'"{v}" is not a recognized theme')
        return v


# Field Definition Schemas
class FieldDefinitionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-z][a-z0-9_]*$')
    label: str = Field(..., min_length=1, max_length=100)
    field_type: str = Field(default='text', pattern=r'^(text|textarea|number|select)$')
    options: Optional[List[str]] = None  # For select type
    placeholder: Optional[str] = Field(None, max_length=200)
    default_enabled: bool = False
    default_required: bool = False
    sort_order: int = Field(default=100, ge=0)


class FieldDefinitionCreate(FieldDefinitionBase):
    pass


class FieldDefinitionUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=100)
    field_type: Optional[str] = Field(None, pattern=r'^(text|textarea|number|select)$')
    options: Optional[List[str]] = None
    placeholder: Optional[str] = Field(None, max_length=200)
    default_enabled: Optional[bool] = None
    default_required: Optional[bool] = None
    is_archived: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)


class FieldDefinitionResponse(BaseModel):
    id: int
    name: str
    label: str
    field_type: str
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None
    default_enabled: bool
    default_required: bool
    is_builtin: bool
    is_archived: bool
    sort_order: int
    created_at: datetime


    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, field):
        import json
        return cls(
            id=field.id,
            name=field.name,
            label=field.label,
            field_type=field.field_type,
            options=json.loads(field.options) if field.options else None,
            placeholder=field.placeholder,
            default_enabled=field.default_enabled,
            default_required=field.default_required,
            is_builtin=field.is_builtin,
            is_archived=field.is_archived,
            sort_order=field.sort_order,
            created_at=field.created_at,
        )


# NCS Rotation Schemas
class NCSRotationMemberBase(BaseModel):
    user_id: int
    position: int
    is_active: bool = True


class NCSRotationMemberCreate(BaseModel):
    user_id: int


class NCSRotationMemberReorder(BaseModel):
    """Request body for reordering rotation members"""
    member_ids: List[int]


class NCSRotationMemberResponse(NCSRotationMemberBase):
    id: int
    template_id: int
    created_at: datetime
    # User info for display
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    user_callsign: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_user(cls, member):
        return cls(
            id=member.id,
            template_id=member.template_id,
            user_id=member.user_id,
            position=member.position,
            is_active=member.is_active,
            created_at=member.created_at,
            user_email=member.user.email if member.user else None,
            user_name=member.user.name if member.user else None,
            user_callsign=member.user.callsign if member.user else None,
        )


class NCSScheduleOverrideCreate(BaseModel):
    scheduled_date: datetime
    replacement_user_id: Optional[int] = None  # None = cancel the net
    reason: Optional[str] = Field(None, max_length=500)


class NCSScheduleOverrideResponse(BaseModel):
    id: int
    template_id: int
    scheduled_date: datetime
    original_user_id: Optional[int]
    replacement_user_id: Optional[int]
    reason: Optional[str]
    created_by_id: Optional[int]
    created_at: datetime
    # User info for display
    original_user_name: Optional[str] = None
    original_user_callsign: Optional[str] = None
    replacement_user_name: Optional[str] = None
    replacement_user_callsign: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_users(cls, override):
        return cls(
            id=override.id,
            template_id=override.template_id,
            scheduled_date=override.scheduled_date,
            original_user_id=override.original_user_id,
            replacement_user_id=override.replacement_user_id,
            reason=override.reason,
            created_by_id=override.created_by_id,
            created_at=override.created_at,
            original_user_name=override.original_user.name if override.original_user else None,
            original_user_callsign=override.original_user.callsign if override.original_user else None,
            replacement_user_name=override.replacement_user.name if override.replacement_user else None,
            replacement_user_callsign=override.replacement_user.callsign if override.replacement_user else None,
        )


class NCSScheduleEntry(BaseModel):
    """A single entry in the computed NCS schedule"""
    date: datetime
    user_id: Optional[int]
    user_name: Optional[str]
    user_callsign: Optional[str]
    user_email: Optional[str]
    is_override: bool = False
    is_fifth_week: bool = False
    is_cancelled: bool = False
    override_reason: Optional[str] = None
    override_id: Optional[int] = None  # ID of the override, if this is an override


class NCSScheduleResponse(BaseModel):
    """Response containing the computed NCS schedule for multiple dates"""
    template_id: int
    fifth_week_user_id: Optional[int] = None
    fifth_week_user_callsign: Optional[str] = None
    fifth_week_user_name: Optional[str] = None
    schedule: List[NCSScheduleEntry]
    rotation_members: List[NCSRotationMemberResponse]


# Template Staff Schemas (separate from rotation)
class TemplateStaffCreate(BaseModel):
    """Request to add a staff member"""
    user_id: int


class TemplateStaffResponse(BaseModel):
    """Response for a template staff member"""
    id: int
    template_id: int
    user_id: int
    is_active: bool
    is_co_manager: bool = False
    created_at: datetime
    # User info for display
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    user_callsign: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_user(cls, staff):
        from app.utils import get_avatar_url
        return cls(
            id=staff.id,
            template_id=staff.template_id,
            user_id=staff.user_id,
            is_active=staff.is_active,
            is_co_manager=getattr(staff, 'is_co_manager', False),
            created_at=staff.created_at,
            user_email=staff.user.email if staff.user else None,
            user_name=staff.user.name if staff.user else None,
            user_callsign=staff.user.callsign if staff.user else None,
            avatar_url=get_avatar_url(
                staff.user.email if staff.user else None,
                getattr(staff.user, 'avatar_url', None) if staff.user else None,
            ),
        )


# Statistics Schemas

class TimeSeriesDataPoint(BaseModel):
    """A single data point for time-series charts"""
    label: str  # Display label (e.g., "11/30", "2024-W48")
    value: int  # The count/value
    date: str  # ISO date string for reference


# ========== Check-In Map Schemas ==========

class CheckInMapDataPoint(BaseModel):
    """A geographic region with aggregated check-in count for the statistics map.
    Locations are coarsened to 4-char Maidenhead grid squares (~100km) or
    state/province centroids to protect individual privacy."""
    region: str  # 4-char grid square (e.g., "FN43") or state/province code
    latitude: float
    longitude: float
    count: int


class CheckInMapResponse(BaseModel):
    """Response for the check-in geographic distribution map"""
    regions: List[CheckInMapDataPoint]
    total_locations: int  # Number of distinct raw locations parsed


class TopOperator(BaseModel):
    """Top operator by check-in count, with tie-breaking by earliest check-in"""
    callsign: str
    check_in_count: int
    first_check_in: datetime  # Used for tie-breaking - earlier check-in wins


class NetParticipation(BaseModel):
    """User's participation in a specific net"""
    net_id: int
    net_name: str
    template_id: Optional[int] = None
    check_in_count: int
    first_check_in: datetime
    last_check_in: datetime


class NcsNetEntry(BaseModel):
    """A net where the user ran as NCS"""
    net_id: int
    net_name: str
    started_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class CheckInsByNet(BaseModel):
    """Check-in count for a net (used in favorites)"""
    net_id: int
    net_name: str
    count: int


class TrafficHandledEntry(BaseModel):
    """One row of a user's "traffic handled" drill-down (see ActivityTab.tsx's
    traffic drill-down, following the same DrillDownTable contract as
    nets_as_ncs_list). One row per distinct form the user has any
    traffic_log_entries row on, with the most recent action they logged for
    it. Never carries the message body -- only promoted Form columns."""
    form_id: int
    net_id: Optional[int] = None
    net_name: Optional[str] = None
    form_type: str
    message_number: Optional[str] = None
    action: TrafficAction
    occurred_at: datetime


class GlobalStatsResponse(BaseModel):
    """Global platform statistics"""
    # Totals
    total_nets: int
    total_check_ins: int
    total_users: int
    unique_operators: int

    # Current activity
    active_nets: int
    nets_last_24h: int
    nets_last_7_days: int
    nets_last_30_days: int
    check_ins_last_24h: int
    check_ins_last_7_days: int

    # Averages
    avg_check_ins_per_net: float

    # Assisted Traffic Handling: distinct forms with any traffic_log_entries
    # row, platform-wide, broken out by action (see
    # TRAFFIC-HANDLING-DESIGN.md section 3.5).
    traffic_handled: int = 0
    traffic_by_action: dict = Field(default_factory=dict)

    # Time series for charts
    nets_per_day: List[TimeSeriesDataPoint]  # Last 30 days
    nets_per_week: List[TimeSeriesDataPoint]  # Last 6 months
    check_ins_per_day: List[TimeSeriesDataPoint]  # Last 30 days
    unique_operators_per_week: List[TimeSeriesDataPoint]  # Last 6 months


class NetStatsResponse(BaseModel):
    """Statistics for a specific net"""
    net_id: int
    net_name: str
    status: str
    template_id: Optional[int] = None  # ID of the recurring net template, if any
    
    # Counts
    total_check_ins: int
    unique_callsigns: int
    rechecks: int
    
    # Timing
    duration_minutes: Optional[int]
    started_at: Optional[datetime]
    closed_at: Optional[datetime]
    
    # Breakdowns
    status_counts: dict  # {"checked_in": 5, "checked_out": 3, ...}
    check_ins_timeline: List[TimeSeriesDataPoint]  # Check-ins over time during net
    top_operators: List[TopOperator]  # All operators in this net, sorted by check-in count
    check_ins_by_frequency: dict  # {"146.520 MHz": 10, "Wires-X Room 12345": 5}
    frequency_count: int = 0  # Total frequencies in the net's Communications Plan

    # Assisted Traffic Handling: distinct forms with any traffic_log_entries
    # row whose own net_id is this net (the hop happened during this net's
    # session -- see TRAFFIC-HANDLING-DESIGN.md R4), broken out by action.
    traffic_handled: int = 0
    traffic_by_action: dict = Field(default_factory=dict)  # {"originated": 2, "relayed": 1, ...}


class FrequentNetStats(BaseModel):
    """Statistics about a user's participation in a recurring net"""
    net_name: str
    template_id: Optional[int] = None
    check_ins: int
    total_instances: int = 0  # Total instances of this recurring net
    participation_rate: Optional[float] = None  # 0-1, percentage of instances checked into


class UserStatsResponse(BaseModel):
    """Statistics for a user"""
    user_id: int
    callsign: Optional[str]
    
    # Totals
    total_check_ins: int
    unique_nets: int
    nets_participated: int = 0  # Alias for unique_nets for backwards compat
    nets_as_ncs: int = 0  # Number of nets where user was NCS
    last_30_days_check_ins: int = 0  # Check-ins in last 30 days
    
    # Participation details - kept for backwards compat
    nets_participated_list: List[NetParticipation] = []
    check_ins_by_month: List[TimeSeriesDataPoint] = []  # Last 12 months
    favorite_nets: List[CheckInsByNet] = []  # Top 5 nets by check-in count

    # New field for recurring net participation
    frequent_nets: List[FrequentNetStats] = []  # Recurring nets with participation rates
    nets_as_ncs_list: List[NcsNetEntry] = []  # Nets where user ran as NCS

    # Assisted Traffic Handling: distinct forms with any traffic_log_entries
    # row reported by this user, broken out by action (originated/relayed/
    # delivered/etc.), plus the drill-down list. See
    # TRAFFIC-HANDLING-DESIGN.md section 3.5.
    traffic_handled: int = 0
    traffic_by_action: dict = Field(default_factory=dict)
    traffic_handled_list: List[TrafficHandledEntry] = []



# ========== Topic History Schemas ==========

class TopicHistoryBase(BaseModel):
    topic: str = Field(max_length=500)
    used_date: datetime


class TopicHistoryCreate(TopicHistoryBase):
    template_id: int
    net_id: Optional[int] = None


class TopicHistoryUpdate(BaseModel):
    topic: Optional[str] = Field(None, max_length=500)
    used_date: Optional[datetime] = None


# ========== Can Hear (Station-to-Station Coverage) Schemas ==========

class CanHearReportResponse(BaseModel):
    id: int
    net_id: int
    reporter_check_in_id: int
    heard_check_in_id: int
    reporter_callsign: str
    heard_callsign: str
    frequency_id: Optional[int] = None
    reported_by_user_id: Optional[int] = None
    reported_at: datetime

    class Config:
        from_attributes = True


class CanHearReportSave(BaseModel):
    reporter_check_in_id: int
    heard_check_in_ids: List[int]
    frequency_id: Optional[int] = None
    operating_position: Optional[str] = Field(None, max_length=50)


class CoverageStationResponse(BaseModel):
    """Phase 5 personal coverage rollup entry (see docs/ROADMAP.md
    "Relaying & Propagation Mapping", Profile map section). One row per
    heard station, aggregated across all of the current user's own "can
    hear" reports made while operating from home. last_heard is a
    MAX(reported_at) rollup across every net the callsign was heard on, not
    a single net's timestamp; confirmation_count is the number of distinct
    nets it was confirmed on; location is the heard check-in's location
    from whichever report is most recent (a station's location can vary
    across nets, e.g. a mobile station)."""
    callsign: str
    last_heard: datetime
    confirmation_count: int
    location: Optional[str] = None

    class Config:
        from_attributes = True


class TopicHistoryResponse(TopicHistoryBase):
    id: int
    template_id: int
    net_id: Optional[int] = None

    class Config:
        from_attributes = True


# ========== Traffic (Assisted Traffic Handling & Forms) Schemas ==========
# See docs/concepts/TRAFFIC-HANDLING-DESIGN.md sections 2 and 3.

class FormDefinitionFieldResponse(BaseModel):
    id: int
    definition_id: int
    name: str
    label: str
    field_type: str
    description: Optional[str] = None
    help_text: Optional[str] = None
    is_required: bool
    max_length: Optional[int] = None
    choices: Optional[List[str]] = None
    validator: Optional[str] = None
    default_now: Optional[str] = None
    auto_fill: Optional[str] = None
    nts_normalize: bool
    arl_enabled: bool
    starts_new_section: bool
    sort_order: int

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, field):
        import json
        return cls(
            id=field.id,
            definition_id=field.definition_id,
            name=field.name,
            label=field.label,
            field_type=field.field_type,
            description=field.description,
            help_text=field.help_text,
            is_required=field.is_required,
            max_length=field.max_length,
            choices=json.loads(field.choices) if field.choices else None,
            validator=field.validator,
            default_now=field.default_now,
            auto_fill=field.auto_fill,
            nts_normalize=field.nts_normalize,
            arl_enabled=field.arl_enabled,
            starts_new_section=field.starts_new_section,
            sort_order=field.sort_order,
        )


class FormDefinitionFieldOverride(BaseModel):
    """One field's admin override within a FormDefinitionUpdate. Only label
    and description may be overridden -- the field set of a builtin cannot
    be changed (TRAFFIC-HANDLING-DESIGN.md D1)."""
    id: int
    label: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None


class FormDefinitionUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)
    field_overrides: Optional[List[FormDefinitionFieldOverride]] = None


class FormDefinitionResponse(BaseModel):
    id: int
    form_type: str
    title: str
    description: Optional[str] = None
    version: str
    output_format: str
    is_builtin: bool
    is_enabled: bool
    sort_order: int
    # RRI strip types only (null on every other output_format): the leading
    # keyword of the canonical slash-delimited string. Usually the form_type
    # itself, but not always -- GYX-CAR-SKYWARN goes on the air as
    # "GYX-CAR WEATHER". Published so the composer can build the same string
    # rri_strip.format_rri_strip() will.
    strip_keyword: Optional[str] = None
    fields: List[FormDefinitionFieldResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, definition):
        fields = [FormDefinitionFieldResponse.from_orm(f) for f in definition.fields]
        strip_keyword = None
        if definition.output_format == 'rri_strip':
            from app.traffic.rri_strip import strip_layout
            strip_keyword, sections = strip_layout(definition.form_type, definition)
            # A pinned builtin (WXOBS, GYX-CAR-SKYWARN) keeps its "/ /"
            # section breaks in Python, not in form_definition_fields, so the
            # stored starts_new_section flags are all False and would render a
            # strip with no section breaks. Stamp the real layout onto the
            # response instead of shipping a wrong one; for a dynamically
            # defined type this is a no-op, since the layout came from those
            # same flags.
            section_starts = set()
            for section in sections[1:]:
                if section:
                    section_starts.add(section[0])
            for field in fields:
                field.starts_new_section = field.name in section_starts
        return cls(
            id=definition.id,
            form_type=definition.form_type,
            title=definition.title,
            description=definition.description,
            version=definition.version,
            output_format=definition.output_format,
            is_builtin=definition.is_builtin,
            is_enabled=definition.is_enabled,
            sort_order=definition.sort_order,
            strip_keyword=strip_keyword,
            fields=fields,
            created_at=definition.created_at,
            updated_at=definition.updated_at,
        )


class ArlMessageResponse(BaseModel):
    """One entry of the ARL numbered-message catalog, for the ArlMessagePicker.

    Static reference data (not DB-backed), so this mirrors the JSON shape in
    app/traffic/definitions/arl_messages.json directly rather than an ORM row.
    """
    num: int
    word: str
    group: str
    text: str
    blanks: List[str] = Field(default_factory=list)


class TrafficLogEntryCreate(BaseModel):
    action: TrafficAction
    method: Optional[RelayMethod] = None
    method_note: Optional[str] = Field(None, max_length=255)
    path_name: Optional[str] = Field(None, max_length=200)
    handed_to: Optional[str] = Field(None, max_length=200)
    handed_to_user_id: Optional[int] = None
    net_id: Optional[int] = None
    occurred_at: Optional[datetime] = None
    note: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode='after')
    def validate_method_note_required_for_other(self):
        if self.method == RelayMethod.OTHER and not self.method_note:
            raise ValueError('method_note is required when method is "other"')
        return self


class TrafficLogEntryResponse(BaseModel):
    id: int
    form_id: int
    sequence: int
    action: TrafficAction
    method: Optional[RelayMethod] = None
    method_note: Optional[str] = None
    path_name: Optional[str] = None
    handed_to: Optional[str] = None
    handed_to_user_id: Optional[int] = None
    reported_by_user_id: Optional[int] = None
    net_id: Optional[int] = None
    note: Optional[str] = None
    occurred_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class FormCreate(BaseModel):
    form_type: str = Field(..., max_length=32)
    net_id: Optional[int] = None
    field_values: dict = Field(default_factory=dict)
    initial_log_entry: Optional[TrafficLogEntryCreate] = None

    @field_validator('field_values')
    @classmethod
    def validate_field_values(cls, v: dict) -> dict:
        if len(v) > 100:
            raise ValueError('Maximum 100 field values allowed')
        for key, value in v.items():
            if not isinstance(key, str) or len(key) > 64:
                raise ValueError('Field value keys must be strings with max 64 characters')
            if isinstance(value, str) and len(value) > 10000:
                raise ValueError('Field value strings must be max 10000 characters')
        return v


class FormUpdate(BaseModel):
    field_values: Optional[dict] = None

    @field_validator('field_values')
    @classmethod
    def validate_field_values(cls, v: Optional[dict]) -> Optional[dict]:
        if v is None:
            return v
        if len(v) > 100:
            raise ValueError('Maximum 100 field values allowed')
        return v


class FormResponse(BaseModel):
    id: int
    definition_id: int
    form_type: str
    definition_version: str
    net_id: Optional[int] = None
    created_by_id: Optional[int] = None
    field_values: dict = Field(default_factory=dict)
    subject: Optional[str] = None
    addressee_display: Optional[str] = None
    message_number: Optional[str] = None
    precedence: Optional[str] = None
    handling: Optional[str] = None
    station_of_origin: Optional[str] = None
    check_count: Optional[int] = None
    check_stated: Optional[int] = None
    normalized_text: Optional[str] = None
    held_by_user_id: Optional[int] = None
    held_since: Optional[datetime] = None
    last_action: Optional[TrafficAction] = None
    disposition: FormDisposition
    filed_at: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        import json
        from app.traffic.log import derive_disposition
        field_values = obj.field_values
        if isinstance(field_values, str):
            try:
                field_values = json.loads(field_values) if field_values else {}
            except (json.JSONDecodeError, TypeError):
                field_values = {}
        return cls(
            id=obj.id,
            definition_id=obj.definition_id,
            form_type=obj.form_type,
            definition_version=obj.definition_version,
            net_id=obj.net_id,
            created_by_id=obj.created_by_id,
            field_values=field_values,
            subject=obj.subject,
            addressee_display=obj.addressee_display,
            message_number=obj.message_number,
            precedence=obj.precedence,
            handling=obj.handling,
            station_of_origin=obj.station_of_origin,
            check_count=obj.check_count,
            check_stated=obj.check_stated,
            normalized_text=obj.normalized_text,
            held_by_user_id=obj.held_by_user_id,
            held_since=obj.held_since,
            last_action=obj.last_action,
            disposition=derive_disposition(obj),
            filed_at=obj.filed_at,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class FormListResponse(BaseModel):
    """Paginated /traffic/forms response. total reflects the visibility-scoped
    WHERE clause (app/traffic/visibility.py), not the unfiltered table -- a
    caller who can see 1 of 3 forms gets total=1, never 3."""
    items: List[FormResponse]
    total: int


class FormDetailResponse(FormResponse):
    """GET /traffic/forms/{id}: the full instance plus its definition
    snapshot and chain-of-custody log entries."""
    definition: FormDefinitionResponse
    log_entries: List[TrafficLogEntryResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        base = FormResponse.from_orm(obj)
        entries = sorted(obj.log_entries, key=lambda e: e.sequence)
        return cls(
            **base.model_dump(),
            definition=FormDefinitionResponse.from_orm(obj.definition),
            log_entries=[TrafficLogEntryResponse.from_orm(e) for e in entries],
        )


class TrafficSummaryResponse(BaseModel):
    """GET /traffic/nets/{net_id}/summary: counts by derived disposition plus
    a simple outstanding/stale count for the per-net traffic panel's summary
    strip and the manager badge. `outstanding` is currently a fixed
    24-hour-held placeholder -- Stage C's reminder service will supersede it
    with the real precedence-scaled staleness ladder (see
    TRAFFIC-HANDLING-DESIGN.md D4)."""
    net_id: int
    draft: int = 0
    pending: int = 0
    relayed: int = 0
    delivered: int = 0
    cancelled: int = 0
    outstanding: int = 0


class ImportPreviewRequest(BaseModel):
    """POST /traffic/import/preview body. Stateless parse-only per
    TRAFFIC-HANDLING-DESIGN.md D5 -- this request never causes a write.
    max_length here is a blunt outer safety net against absurdly large
    payloads; the authoritative 32 KB cap (measured in UTF-8 bytes, not
    characters) and the empty-input rejection both live in
    app/traffic/formatters.py::parse_any() and its underlying parsers, whose
    ValueError the router turns into the actual 400 response."""
    text: str = Field(..., max_length=200_000)


class ImportFieldResult(BaseModel):
    """One field of a parse_any() result. Mirrors parse_nts_radiogram's and
    parse_ics213's per-field dict shape exactly (see
    TRAFFIC-HANDLING-DESIGN.md D5): value/source/confidence."""
    value: Optional[Union[str, int]] = None
    source: Literal['bt_block', 'heuristic', 'label_match', 'unparsed']
    confidence: Literal['high', 'low']


class ImportPreviewResponse(BaseModel):
    """POST /traffic/import/preview response -- a light reshape of whatever
    app/traffic/formatters.py::parse_any() returns, not a transformation of
    its semantics. check_stated/check_count are radiogram-only (None for
    ICS-213 and unknown); raw_text is only populated for form_type ==
    "unknown", so nothing the operator pasted is lost."""
    form_type: str
    fields: Dict[str, ImportFieldResult] = Field(default_factory=dict)
    check_stated: Optional[int] = None
    check_count: Optional[int] = None
    warnings: List[str] = Field(default_factory=list)
    unparsed_lines: List[str] = Field(default_factory=list)
    raw_text: Optional[str] = None


class StripTemplateTokenizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=32000)


class StripTemplateToken(BaseModel):
    """One field-to-be-labeled from a pasted RRI strip example. Mirrors
    app/traffic/rri_strip.py::tokenize_strip's dict shape."""
    value: str
    starts_new_section: bool


class StripTemplateTokenizeResponse(BaseModel):
    """POST /traffic/strip-templates/tokenize -- stateless, writes nothing
    (D5 shape, like ImportPreviewResponse). suggested_form_type is the
    paste's leading slash-token (RRI's own strip keyword convention, e.g.
    "SITREP"), offered as a starting point for the form_type field on
    StripTemplateCreate -- the operator can still change it."""
    suggested_form_type: str
    tokens: List[StripTemplateToken] = Field(default_factory=list)


class StripTemplateFieldCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    starts_new_section: bool = False
    value: str = Field(default="", max_length=10000)


class StripTemplateCreate(BaseModel):
    """POST /traffic/strip-templates: define a new, reusable RRI strip type
    from a labeled set of fields, and file the first Form from their values
    in the same call. See routers/traffic_strip_templates.py."""
    form_type: str = Field(..., min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=120)
    net_id: Optional[int] = None
    fields: List[StripTemplateFieldCreate]
    # The Import flow defines a type *from* a real received strip, so filing
    # that first report is the point. Net settings (TrafficSettingsPanel.tsx)
    # defines the type up front from a blank example, where filing a form full
    # of placeholder values would be noise -- hence the opt-out.
    file_first_form: bool = True

    @field_validator('fields')
    @classmethod
    def validate_fields(cls, v: List[StripTemplateFieldCreate]) -> List[StripTemplateFieldCreate]:
        if not v:
            raise ValueError('at least one field is required')
        if len(v) > 100:
            raise ValueError('maximum 100 fields allowed')
        return v


class StripTemplateCreateResponse(BaseModel):
    """POST /traffic/strip-templates. `form` is null when the caller passed
    file_first_form=False -- the type was defined but nothing was filed."""
    definition: FormDefinitionResponse
    form: Optional[FormDetailResponse] = None


class TrafficInboxResponse(BaseModel):
    """GET /traffic/inbox: the caller's pending-held traffic, oldest first.
    Backs both the navbar badge (count only) and the Profile "My Traffic" tab
    and TrafficInbox.tsx (count + items). See TRAFFIC-HANDLING-DESIGN.md
    section 2.5 -- the inbox is a query, not a table."""
    count: int
    items: List[FormResponse] = Field(default_factory=list)


class Ics309LogEntryResponse(BaseModel):
    """One row of the ICS-309 Communications Log table -- same shape the CSV
    exporter has always written (routers/nets_export.py), just structured
    instead of comma-joined."""
    time: str
    from_station: str
    to_station: str
    message: str


class Ics309LogResponse(BaseModel):
    """GET /nets/{id}/export/ics309?format=json: the same header info and log
    rows the CSV export writes, structured for the frontend's ICS309PrintView
    so both formats render from one query (nets_export.py::_build_ics309_data)
    instead of two divergent implementations."""
    incident_name: str
    operational_period_from: Optional[str] = None
    operational_period_to: Optional[str] = None
    radio_operator: str
    channel: str
    entries: List[Ics309LogEntryResponse] = Field(default_factory=list)
    prepared_by: str
    prepared_at: Optional[str] = None
