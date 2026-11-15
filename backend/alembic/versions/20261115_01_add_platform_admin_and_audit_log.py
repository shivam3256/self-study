"""Add platform_admins, admin_audit_log, and tenant subscription override columns

Revision ID: 20261115_01
Revises: 20261109_01
Create Date: 2026-11-15 12:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = '20261115_01'
down_revision = '20261109_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # 1. Create platform_admins table if not exists
    if 'platform_admins' not in tables:
        op.create_table(
            'platform_admins',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('password_hash', sa.String(length=255), nullable=False),
            sa.Column('totp_secret_encrypted', sa.String(length=500), nullable=True),
            sa.Column('totp_enabled', sa.Boolean(), server_default=sa.text('false' if conn.dialect.name == 'postgresql' else '0'), nullable=False),
            sa.Column('recovery_codes_hashed', sa.JSON(), nullable=False),
            sa.Column('failed_attempts', sa.Integer(), server_default='0', nullable=False),
            sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_platform_admins_email', 'platform_admins', ['email'], unique=True)

    # 2. Create admin_audit_log table if not exists
    if 'admin_audit_log' not in tables:
        op.create_table(
            'admin_audit_log',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('admin_id', sa.String(length=36), sa.ForeignKey('platform_admins.id', ondelete='SET NULL'), nullable=True),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('target_type', sa.String(length=100), nullable=False),
            sa.Column('target_id', sa.String(length=100), nullable=True),
            sa.Column('before_json', sa.JSON(), nullable=True),
            sa.Column('after_json', sa.JSON(), nullable=True),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('ip', sa.String(length=100), nullable=True),
            sa.Column('user_agent', sa.String(length=500), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_admin_audit_log_admin_id', 'admin_audit_log', ['admin_id'])
        op.create_index('ix_admin_audit_log_action', 'admin_audit_log', ['action'])
        op.create_index('ix_admin_audit_log_target_type', 'admin_audit_log', ['target_type'])
        op.create_index('ix_admin_audit_log_target_id', 'admin_audit_log', ['target_id'])
        op.create_index('ix_admin_audit_log_created_at', 'admin_audit_log', ['created_at'])

    # 3. Add manual subscription override columns to tenants table if not present
    if 'tenants' in tables:
        tenant_cols = [c['name'] for c in inspector.get_columns('tenants')]
        if 'manually_overridden' not in tenant_cols:
            op.add_column(
                'tenants',
                sa.Column('manually_overridden', sa.Boolean(), server_default=sa.text('false' if conn.dialect.name == 'postgresql' else '0'), nullable=False)
            )
        if 'override_reason' not in tenant_cols:
            op.add_column('tenants', sa.Column('override_reason', sa.Text(), nullable=True))
        if 'overridden_by' not in tenant_cols:
            op.add_column('tenants', sa.Column('overridden_by', sa.String(length=36), sa.ForeignKey('platform_admins.id', ondelete='SET NULL'), nullable=True))
        if 'overridden_at' not in tenant_cols:
            op.add_column('tenants', sa.Column('overridden_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    if 'tenants' in tables:
        tenant_cols = [c['name'] for c in inspector.get_columns('tenants')]
        if 'overridden_at' in tenant_cols:
            op.drop_column('tenants', 'overridden_at')
        if 'overridden_by' in tenant_cols:
            op.drop_column('tenants', 'overridden_by')
        if 'override_reason' in tenant_cols:
            op.drop_column('tenants', 'override_reason')
        if 'manually_overridden' in tenant_cols:
            op.drop_column('tenants', 'manually_overridden')

    if 'admin_audit_log' in tables:
        op.drop_table('admin_audit_log')

    if 'platform_admins' in tables:
        op.drop_table('platform_admins')
