"""add_auth_tables

Revision ID: 3855304b2f6a
Revises: 
Create Date: 2026-09-04 09:55:56.348194

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision: str = '3855304b2f6a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    # ── users table — add new columns only if they don't exist ──────────
    if not _column_exists("users", "must_reset_password"):
        op.add_column("users", sa.Column("must_reset_password", sa.Boolean(),
                                          server_default="false", nullable=False))
    if not _column_exists("users", "email_verified"):
        op.add_column("users", sa.Column("email_verified", sa.Boolean(),
                                          server_default="false", nullable=False))
    if not _column_exists("users", "sso_provider"):
        op.add_column("users", sa.Column("sso_provider", sa.String(length=50), nullable=True))
    if not _column_exists("users", "profile_picture_url"):
        op.add_column("users", sa.Column("profile_picture_url", sa.String(length=500), nullable=True))
    if not _column_exists("users", "failed_login_attempts"):
        op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(),
                                           server_default="0", nullable=False))
    if not _column_exists("users", "locked_until"):
        op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))

    # Existing seed users: mark as verified so they can log in
    op.execute("UPDATE users SET email_verified = true, must_reset_password = false WHERE email_verified = false AND sso_provider IS NULL")

    # ── sessions ──────────────────────────────────────────────────────────
    if not _table_exists("sessions"):
        op.create_table(
            "sessions",
            sa.Column("id",            sa.Integer(),  nullable=False),
            sa.Column("user_id",       sa.Integer(),  nullable=False),
            sa.Column("token_jti",     sa.String(length=100), nullable=False),
            sa.Column("created_at",    sa.DateTime(timezone=True), server_default="now()", nullable=True),
            sa.Column("expires_at",    sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_activity", sa.DateTime(timezone=True), server_default="now()", nullable=True),
            sa.Column("revoked_at",    sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_sessions_id",        "sessions", ["id"],        unique=False)
        op.create_index("ix_sessions_user_id",   "sessions", ["user_id"],   unique=False)
        op.create_index("ix_sessions_token_jti", "sessions", ["token_jti"], unique=True)
        op.create_index("ix_sessions_expires_at","sessions", ["expires_at"],unique=False)

    # ── password_reset_tokens ─────────────────────────────────────────────
    if not _table_exists("password_reset_tokens"):
        op.create_table(
            "password_reset_tokens",
            sa.Column("id",         sa.Integer(),  nullable=False),
            sa.Column("user_id",    sa.Integer(),  nullable=False),
            sa.Column("token",      sa.String(length=100), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at",    sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default="now()", nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_password_reset_tokens_id", "password_reset_tokens", ["id"],    unique=False)
        op.create_index("ix_prt_token",                "password_reset_tokens", ["token"],  unique=True)

    # ── email_verifications ───────────────────────────────────────────────
    if not _table_exists("email_verifications"):
        op.create_table(
            "email_verifications",
            sa.Column("id",          sa.Integer(),  nullable=False),
            sa.Column("user_id",     sa.Integer(),  nullable=False),
            sa.Column("token",       sa.String(length=100), nullable=False),
            sa.Column("expires_at",  sa.DateTime(timezone=True), nullable=False),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at",  sa.DateTime(timezone=True), server_default="now()", nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_email_verifications_id", "email_verifications", ["id"],    unique=False)
        op.create_index("ix_ev_token",               "email_verifications", ["token"],  unique=True)

    # ── auth_audit_logs ───────────────────────────────────────────────────
    if not _table_exists("auth_audit_logs"):
        op.create_table(
            "auth_audit_logs",
            sa.Column("id",          sa.Integer(),  nullable=False),
            sa.Column("user_id",     sa.Integer(),  nullable=True),
            sa.Column("event_type",  sa.String(length=50),  nullable=False),
            sa.Column("ip_address",  sa.String(length=45),  nullable=True),
            sa.Column("user_agent",  sa.String(length=500), nullable=True),
            sa.Column("details",     sa.JSON(),     nullable=True),
            sa.Column("created_at",  sa.DateTime(timezone=True), server_default="now()", nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_auth_audit_logs_id",    "auth_audit_logs", ["id"],         unique=False)
        op.create_index("ix_aal_user_id",           "auth_audit_logs", ["user_id"],    unique=False)
        op.create_index("ix_aal_event_type",        "auth_audit_logs", ["event_type"], unique=False)
        op.create_index("ix_aal_created_at",        "auth_audit_logs", ["created_at"], unique=False)


def downgrade() -> None:
    if _table_exists("auth_audit_logs"):
        op.drop_index("ix_aal_created_at",        table_name="auth_audit_logs")
        op.drop_index("ix_aal_event_type",        table_name="auth_audit_logs")
        op.drop_index("ix_aal_user_id",           table_name="auth_audit_logs")
        op.drop_index("ix_auth_audit_logs_id",    table_name="auth_audit_logs")
        op.drop_table("auth_audit_logs")
    if _table_exists("email_verifications"):
        op.drop_index("ix_ev_token",               table_name="email_verifications")
        op.drop_index("ix_email_verifications_id", table_name="email_verifications")
        op.drop_table("email_verifications")
    if _table_exists("password_reset_tokens"):
        op.drop_index("ix_prt_token",                table_name="password_reset_tokens")
        op.drop_index("ix_password_reset_tokens_id", table_name="password_reset_tokens")
        op.drop_table("password_reset_tokens")
    if _table_exists("sessions"):
        op.drop_index("ix_sessions_expires_at", table_name="sessions")
        op.drop_index("ix_sessions_token_jti",  table_name="sessions")
        op.drop_index("ix_sessions_user_id",    table_name="sessions")
        op.drop_index("ix_sessions_id",         table_name="sessions")
        op.drop_table("sessions")
    for col in ["locked_until", "failed_login_attempts", "profile_picture_url",
                "sso_provider", "email_verified", "must_reset_password"]:
        if _column_exists("users", col):
            op.drop_column("users", col)
