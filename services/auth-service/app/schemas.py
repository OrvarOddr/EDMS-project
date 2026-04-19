from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    is_superuser: bool = False


class UserResponse(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    status: str
    is_superuser: bool
    roles: list[str] = []


class AssignRoleRequest(BaseModel):
    user_id: str
    role_id: str


class RoleResponse(BaseModel):
    id: str
    code: str
    name: str
    description: str | None
