"""Add lockers, locker assignments and extend payments

Revision ID: 20261010_01
Revises: 
Create Date: 2026-10-10 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = '20261010_01'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # 1. Create lockers table if not exists
    if 'lockers' not in tables:
        op.create_table(
            'lockers',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('label', sa.String(length=50), nullable=False),
            sa.Column('monthly_fee', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='available'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_lockers_tenant_id', 'lockers', ['tenant_id'])
        op.create_index('ix_lockers_tenant_status', 'lockers', ['tenant_id', 'status'])
        op.create_index('uq_tenant_locker_label', 'lockers', ['tenant_id', 'label'], unique=True)

    # 2. Create locker_assignments table if not exists
    if 'locker_assignments' not in tables:
        op.create_table(
            'locker_assignments',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('locker_id', sa.String(length=36), sa.ForeignKey('lockers.id', ondelete='CASCADE'), nullable=False),
            sa.Column('student_id', sa.String(length=36), sa.ForeignKey('students.id', ondelete='CASCADE'), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('paid_until', sa.Date(), nullable=False),
            sa.Column('monthly_fee', sa.Numeric(10, 2), nullable=False),
            sa.Column('deposit_amount', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
            sa.Column('deposit_returned', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='active'),
            sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_locker_assignments_tenant_id', 'locker_assignments', ['tenant_id'])
        op.create_index('ix_locker_assignments_locker_id', 'locker_assignments', ['locker_id'])
        op.create_index('ix_locker_assignments_student_id', 'locker_assignments', ['student_id'])
        op.create_index('ix_locker_assignments_dates', 'locker_assignments', ['tenant_id', 'status', 'paid_until'])
        op.create_index(
            'uq_active_locker_assignment',
            'locker_assignments',
            ['tenant_id', 'locker_id'],
            unique=True,
            sqlite_where=(sa.column('status') == 'active'),
            postgresql_where=(sa.column('status') == 'active')
        )
        op.create_index(
            'uq_active_student_locker',
            'locker_assignments',
            ['tenant_id', 'student_id'],
            unique=True,
            sqlite_where=(sa.column('status') == 'active'),
            postgresql_where=(sa.column('status') == 'active')
        )

    # 3. Add columns to payments table
    if 'payments' in tables:
        payment_cols = [c['name'] for c in inspector.get_columns('payments')]
        if 'payment_type' not in payment_cols:
            op.add_column('payments', sa.Column('payment_type', sa.String(length=50), server_default='seat', nullable=False))
        if 'locker_assignment_id' not in payment_cols:
            op.add_column('payments', sa.Column('locker_assignment_id', sa.String(length=36), nullable=True))
            op.create_index('ix_payments_locker_assignment_id', 'payments', ['locker_assignment_id'])
        if 'receipt_id' not in payment_cols:
            op.add_column('payments', sa.Column('receipt_id', sa.String(length=100), nullable=True))
            op.create_index('ix_payments_receipt_id', 'payments', ['tenant_id', 'receipt_id'])
            op.execute("UPDATE payments SET receipt_id = receipt_number WHERE receipt_id IS NULL")


def downgrade() -> None:
    # Downgrade operations
    pass
