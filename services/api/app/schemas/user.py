"""Pydantic schemas for the User resource."""

import uuid

from pydantic import BaseModel, EmailStr

from services.api.app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    organisation_id: uuid.UUID


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: UserRole
    is_active: bool
    organisation_id: uuid.UUID

    model_config = {"from_attributes": True}
