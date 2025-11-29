from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from app.models import UserRole, NetStatus, StationStatus
import re


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
    show_activity_in_chat: Optional[bool] = None
    sms_gateway: Optional[str] = Field(None, max_length=100)
    skywarn_number: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    prefer_utc: Optional[bool] = None
    
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


class UserResponse(UserBase):
    id: int
    is_active: bool
    email_notifications: bool
    notify_net_start: bool = True
    notify_net_close: bool = True
    notify_net_reminder: bool = False
    show_activity_in_chat: bool = True
    gmrs_callsign: Optional[str] = None
    skywarn_number: Optional[str] = None
    location: Optional[str] = None
    prefer_utc: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        import json
        # Deserialize callsigns JSON field
        if hasattr(obj, 'callsigns') and obj.callsigns:
            try:
                obj.callsigns = json.loads(obj.callsigns) if isinstance(obj.callsigns, str) else obj.callsigns
            except (json.JSONDecodeError, TypeError):
                obj.callsigns = []
        else:
            obj.callsigns = []
        return super().from_orm(obj)


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


# Net Schemas
class NetBase(BaseModel):
    name: str = Field(max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    script: Optional[str] = Field(None, max_length=50000)
    field_config: Optional[dict] = None


class NetCreate(NetBase):
    frequency_ids: List[int] = []


class NetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    script: Optional[str] = Field(None, max_length=50000)
    status: Optional[NetStatus] = None
    active_frequency_id: Optional[int] = None
    frequency_ids: Optional[List[int]] = Field(None, max_length=50)
    field_config: Optional[dict] = None
    
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
    active_frequency_id: Optional[int] = None
    field_config: Optional[dict] = None
    started_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    frequencies: List[FrequencyResponse] = []
    check_in_count: Optional[int] = None

    @classmethod
    def from_orm(cls, net, owner_callsign: str = None, owner_name: str = None, check_in_count: int = None):
        import json
        data = {
            'id': net.id,
            'name': net.name,
            'description': net.description,
            'script': net.script,
            'status': net.status,
            'owner_id': net.owner_id,
            'owner_callsign': owner_callsign,
            'owner_name': owner_name,
            'active_frequency_id': net.active_frequency_id,
            'field_config': json.loads(net.field_config) if net.field_config else None,
            'started_at': net.started_at,
            'closed_at': net.closed_at,
            'created_at': net.created_at,
            'frequencies': [FrequencyResponse.model_validate(f) for f in net.frequencies],
            'check_in_count': check_in_count
        }
        return cls(**data)

    class Config:
        from_attributes = True


# Net Template Schemas
class NetTemplateBase(BaseModel):
    name: str = Field(max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    field_config: Optional[dict] = None
    schedule_type: Optional[str] = Field(default='ad_hoc')  # ad_hoc, daily, weekly, monthly
    schedule_config: Optional[dict] = Field(default_factory=dict)  # {day_of_week, week_of_month, time}


class NetTemplateCreate(NetTemplateBase):
    frequency_ids: Optional[List[int]] = []


class NetTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    field_config: Optional[dict] = None
    frequency_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None
    schedule_type: Optional[str] = None
    schedule_config: Optional[dict] = None
    owner_id: Optional[int] = None  # Allow changing the owner (admin only or current owner)


class NetTemplateResponse(NetTemplateBase):
    id: int
    owner_id: int
    owner_callsign: Optional[str] = None
    owner_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    frequencies: List[FrequencyResponse] = []
    subscriber_count: int = 0
    is_subscribed: bool = False

    @classmethod
    def from_orm(cls, template, subscriber_count: int = 0, is_subscribed: bool = False, owner_callsign: str = None, owner_name: str = None):
        import json
        data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'owner_id': template.owner_id,
            'owner_callsign': owner_callsign,
            'owner_name': owner_name,
            'field_config': json.loads(template.field_config) if template.field_config else None,
            'schedule_type': template.schedule_type,
            'schedule_config': json.loads(template.schedule_config) if template.schedule_config else {},
            'is_active': template.is_active,
            'created_at': template.created_at,
            'frequencies': [FrequencyResponse.model_validate(f) for f in template.frequencies],
            'subscriber_count': subscriber_count,
            'is_subscribed': is_subscribed
        }
        return cls(**data)

    class Config:
        from_attributes = True


class NetTemplateSubscriptionResponse(BaseModel):
    id: int
    template_id: int
    user_id: int
    subscribed_at: datetime

    class Config:
        from_attributes = True


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
    available_frequency_ids: Optional[List[int]] = None
    custom_fields: Optional[dict] = None


class CheckInResponse(CheckInBase):
    id: int
    net_id: int
    user_id: Optional[int] = None
    status: StationStatus
    frequency_id: Optional[int] = None
    available_frequencies: List[int] = Field(default_factory=list)
    custom_fields: Optional[dict] = Field(default_factory=dict)
    is_recheck: bool
    checked_in_by_id: Optional[int] = None
    checked_in_at: datetime
    checked_out_at: Optional[datetime] = None

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        import json
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


class ChatMessageResponse(BaseModel):
    id: int
    net_id: int
    user_id: Optional[int] = None
    callsign: Optional[str] = None
    message: str
    is_system: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        # Include callsign from user relationship
        data = {
            'id': obj.id,
            'net_id': obj.net_id,
            'user_id': obj.user_id,
            'callsign': obj.user.callsign if obj.user and obj.user.callsign else ('System' if obj.is_system else 'Unknown'),
            'message': obj.message,
            'is_system': obj.is_system if hasattr(obj, 'is_system') else False,
            'created_at': obj.created_at
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


class AppSettingsResponse(BaseModel):
    default_field_config: dict
    field_labels: dict

    class Config:
        from_attributes = True


class AppSettingsUpdate(BaseModel):
    default_field_config: Optional[dict] = None
    field_labels: Optional[dict] = None


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
    is_cancelled: bool = False
    override_reason: Optional[str] = None
    override_id: Optional[int] = None  # ID of the override, if this is an override


class NCSScheduleResponse(BaseModel):
    """Response containing the computed NCS schedule for multiple dates"""
    template_id: int
    schedule: List[NCSScheduleEntry]
    rotation_members: List[NCSRotationMemberResponse]

