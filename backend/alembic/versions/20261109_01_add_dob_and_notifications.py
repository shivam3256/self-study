"""Add date_of_birth to students, error_reason to reminder_logs, and create notifications table

Revision ID: 20261109_01
Revises: 20261010_01
Create Date: 2026-11-09 20:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = '20261109_01'
down_revision = '20261010_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # 1. Add date_of_birth to students if not present
    if 'students' in tables:
        student_cols = [c['name'] for c in inspector.get_columns('students')]
        if 'date_of_birth' not in student_cols:
            op.add_column('students', sa.Column('date_of_birth', sa.Date(), nullable=True))
            op.create_index('ix_students_date_of_birth', 'students', ['date_of_birth'])

    # 2. Add error_reason to reminder_logs if not present
    if 'reminder_logs' in tables:
        reminder_cols = [c['name'] for c in inspector.get_columns('reminder_logs')]
        if 'error_reason' not in reminder_cols:
            op.add_column('reminder_logs', sa.Column('error_reason', sa.Text(), nullable=True))

    # 3. Create notifications table if not exists
    if 'notifications' not in tables:
        op.create_table(
            'notifications',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('type', sa.String(length=50), nullable=False),
            sa.Column('student_id', sa.String(length=36), sa.ForeignKey('students.id', ondelete='CASCADE'), nullable=True),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('dedupe_key', sa.String(length=255), nullable=False),
            sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('dismissed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('tenant_id', 'dedupe_key', name='uq_tenant_notification_dedupe')
        )
        op.create_index('ix_notifications_tenant_id', 'notifications', ['tenant_id'])
        op.create_index('ix_notifications_type', 'notifications', ['type'])
        op.create_index('ix_notifications_student_id', 'notifications', ['student_id'])
        op.create_index('ix_notifications_dedupe_key', 'notifications', ['dedupe_key'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    if 'notifications' in tables:
        op.drop_table('notifications')

    if 'reminder_logs' in tables:
        reminder_cols = [c['name'] for c in inspector.get_columns('reminder_logs')]
        if 'error_reason' in reminder_cols:
            op.drop_column('reminder_logs', 'error_reason')

    if 'students' in tables:
        student_cols = [c['name'] for c in inspector.get_columns('students')]
        if 'date_of_birth' in student_cols:
            op.drop_index('ix_students_date_of_birth', table_name='students')
            op.drop_column('students', 'date_of_birth')

