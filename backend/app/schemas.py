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
    role: UserRole = UserRole.USER
    
    @field_validator('callsign')
    @classmethod
    def validate_callsign(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r'^[A-Z0-9/]+$', v):
            raise ValueError('Callsign must contain only uppercase letters, numbers, and forward slashes')
        return v


class UserCreate(UserBase):
    oauth_provider: str
    oauth_id: str


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100, min_length=1)
    callsign: Optional[str] = Field(None, max_length=20, min_length=3)
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


class UserResponse(UserBase):
    id: int
    is_active: bool
    email_notifications: bool
    skywarn_number: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Frequency Schemas
class FrequencyBase(BaseModel):
    frequency: Optional[str] = Field(None, max_length=50)
    mode: str = Field(max_length=20, pattern=r'^(FM|AM|SSB|USB|LSB|CW|DIGITAL|DMR|D-STAR|FUSION|YSF|P25)$')
    network: Optional[str] = Field(None, max_length=100)  # e.g., "Wires-X", "Brandmeister", "REF030C"
    talkgroup: Optional[str] = Field(None, max_length=50)  # e.g., "31665", "Room 12345"
    description: Optional[str] = Field(None, max_length=500)
    
    @model_validator(mode='after')
    def validate_freq_or_network(self):
        """Ensure either frequency or network is provided."""
        if not self.frequency and not self.network:
            raise ValueError('Either frequency or network must be provided')
        return self


class FrequencyCreate(FrequencyBase):
    pass


class FrequencyResponse(FrequencyBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Net Schemas
class NetBase(BaseModel):
    name: str = Field(max_length=200, min_length=1)
    description: Optional[str] = Field(None, max_length=2000)


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
    started_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    frequencies: List[FrequencyResponse] = []

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
