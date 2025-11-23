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


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100, min_length=1)
    callsign: Optional[str] = Field(None, max_length=20, min_length=3)
    callsigns: Optional[List[str]] = None
    email_notifications: Optional[bool] = None
    sms_gateway: Optional[str] = Field(None, max_length=100)
    skywarn_number: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    
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
    skywarn_number: Optional[str] = None
    location: Optional[str] = None
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
    mode: str = Field(max_length=20, pattern=r'^(FM|AM|SSB|USB|LSB|CW|DIGITAL|DMR|D-STAR|FUSION|YSF|P25)$')
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
    field_config: Optional[dict] = None


class NetCreate(NetBase):
    frequency_ids: List[int] = []


class NetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[NetStatus] = None
    active_frequency_id: Optional[int] = None
    frequency_ids: Optional[List[int]] = Field(None, max_length=50)
    
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
    active_frequency_id: Optional[int] = None
    field_config: Optional[dict] = None
    started_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    frequencies: List[FrequencyResponse] = []

    @classmethod
    def from_orm(cls, net):
        import json
        data = {
            'id': net.id,
            'name': net.name,
            'description': net.description,
            'status': net.status,
            'owner_id': net.owner_id,
            'active_frequency_id': net.active_frequency_id,
            'field_config': json.loads(net.field_config) if net.field_config else None,
            'started_at': net.started_at,
            'closed_at': net.closed_at,
            'created_at': net.created_at,
            'frequencies': [FrequencyResponse.model_validate(f) for f in net.frequencies]
        }
        return cls(**data)

    class Config:
        from_attributes = True


# Net Template Schemas
class NetTemplateBase(BaseModel):
    name: str = Field(max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    field_config: Optional[dict] = None


class NetTemplateCreate(NetTemplateBase):
    frequency_ids: Optional[List[int]] = []


class NetTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    field_config: Optional[dict] = None
    frequency_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None


class NetTemplateResponse(NetTemplateBase):
    id: int
    owner_id: int
    is_active: bool
    created_at: datetime
    frequencies: List[FrequencyResponse] = []
    subscriber_count: int = 0
    is_subscribed: bool = False

    @classmethod
    def from_orm(cls, template, subscriber_count: int = 0, is_subscribed: bool = False):
        import json
        data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'owner_id': template.owner_id,
            'field_config': json.loads(template.field_config) if template.field_config else None,
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
    name: str = Field(max_length=100, min_length=1)
    location: str = Field(max_length=200, min_length=1)
    skywarn_number: Optional[str] = Field(None, max_length=50)
    weather_observation: Optional[str] = Field(None, max_length=2000)
    power_source: Optional[str] = Field(None, max_length=100)
    feedback: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=2000)
    
    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: str) -> str:
        if not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v


class CheckInCreate(CheckInBase):
    frequency_id: Optional[int] = None
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
    status: Optional[StationStatus] = None
    skywarn_number: Optional[str] = Field(None, max_length=50)
    weather_observation: Optional[str] = Field(None, max_length=2000)
    power_source: Optional[str] = Field(None, max_length=100)
    feedback: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=2000)


class CheckInResponse(CheckInBase):
    id: int
    net_id: int
    user_id: Optional[int] = None
    status: StationStatus
    frequency_id: Optional[int] = None
    is_recheck: bool
    checked_in_by_id: Optional[int] = None
    checked_in_at: datetime
    checked_out_at: Optional[datetime] = None

    class Config:
        from_attributes = True


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
    user_id: int
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


# Authentication Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkVerify(BaseModel):
    token: str
