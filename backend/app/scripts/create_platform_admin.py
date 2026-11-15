import argparse
import asyncio
import getpass
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.core.config import settings
from app.core.admin_security import hash_admin_password
from app.models.platform_admin import PlatformAdmin


async def create_or_update_platform_admin(email: str, password: str) -> None:
    db_url = settings.DATABASE_URL
    connect_args = {}
    if "sqlite" in db_url:
        connect_args["check_same_thread"] = False
    elif db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url, echo=False, connect_args=connect_args)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with session_maker() as session:
        clean_email = email.strip().lower()
        stmt = select(PlatformAdmin).where(PlatformAdmin.email == clean_email)
        res = await session.execute(stmt)
        admin = res.scalar_one_or_none()

        pwd_hash = hash_admin_password(password)

        if admin:
            print(f"[!] Platform admin with email '{clean_email}' already exists.")
            admin.password_hash = pwd_hash
            admin.failed_attempts = 0
            admin.locked_until = None
            await session.commit()
            print(f"[✓] Successfully updated password for platform admin '{clean_email}'.")
            print("[*] 2FA status remains unchanged.")
        else:
            new_admin = PlatformAdmin(
                email=clean_email,
                password_hash=pwd_hash,
                totp_enabled=False,
                totp_secret_encrypted=None,
                recovery_codes_hashed=[],
                failed_attempts=0,
                locked_until=None,
            )
            session.add(new_admin)
            await session.commit()
            print(f"[✓] Platform admin '{clean_email}' created successfully.")
            print("[*] 2FA enrollment will be required upon first login via the admin portal.")

    await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Seed or update a LibMa platform super admin account.")
    parser.add_argument("--email", help="Super admin email address")
    parser.add_argument("--password", help="Super admin password")
    args = parser.parse_args()

    email = args.email or os.getenv("SUPERADMIN_EMAIL")
    password = args.password or os.getenv("SUPERADMIN_PASSWORD")

    if not email:
        try:
            email = input("Enter platform admin email: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.")
            sys.exit(1)

    if not password:
        try:
            password = getpass.getpass("Enter platform admin password (min 8 chars): ")
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.")
            sys.exit(1)

    if not email or "@" not in email:
        print("Error: A valid email address is required.")
        sys.exit(1)

    if not password or len(password) < 8:
        print("Error: Password must be at least 8 characters.")
        sys.exit(1)

    asyncio.run(create_or_update_platform_admin(email, password))


if __name__ == "__main__":
    main()
