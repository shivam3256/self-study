import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base, get_utc_now

class PlatformAdmin(Base):
    __tablename__ = "platform_admins"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    totp_secret_encrypted = Column(String(500), nullable=True)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    recovery_codes_hashed = Column(JSON, default=list, nullable=False)
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    audit_logs = relationship("AdminAuditLog", back_populates="admin", foreign_keys="AdminAuditLog.admin_id")


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id = Column(String(36), ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    target_type = Column(String(100), nullable=False, index=True)
    target_id = Column(String(100), nullable=True, index=True)
    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    ip = Column(String(100), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    admin = relationship("PlatformAdmin", back_populates="audit_logs", foreign_keys=[admin_id])
