from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import BaseModel

class EmailOTP(BaseModel):
    __tablename__ = "email_otps"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose = Column(String(50), default="signup_verify", nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="otps")

    __table_args__ = (
        Index("ix_email_otps_user_purpose", "user_id", "purpose"),
    )
