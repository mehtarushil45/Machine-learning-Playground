"""Email dispatch service (Part E3).

Handles delivery of:
- Verification emails (Part D3)
- Password reset emails (Part E1, E2)
- Duplicate registration notices (Part D2)

Supports standard SMTP (Mailpit in development, Amazon SES / SendGrid / Postmark in production),
with automatic logging fallback when running in offline or test environments.
"""

from __future__ import annotations

import asyncio
import email.message
import logging
import smtplib
from typing import Optional

from app.config import settings

logger = logging.getLogger("auth.email")


def _send_smtp_sync(msg: email.message.EmailMessage, host: str, port: int, user: str, password: str, tls: bool) -> None:
    """Synchronous SMTP worker designed to be executed in a thread pool."""
    server: Optional[smtplib.SMTP] = None
    try:
        server = smtplib.SMTP(host=host, port=port, timeout=10)
        if tls:
            server.starttls()
        if user and password:
            server.login(user, password)
        server.send_message(msg)
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass


class EmailService:
    """Asynchronous email delivery service."""

    @staticmethod
    async def send_raw_email(
        to_email: str,
        subject: str,
        text_content: str,
        html_content: Optional[str] = None,
    ) -> bool:
        """Deliver an email via configured SMTP host or log if unavailable."""
        msg = email.message.EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email
        msg["To"] = to_email
        msg.set_content(text_content)

        if html_content:
            msg.add_alternative(html_content, subtype="html")

        # Always log high-fidelity notice for local observability
        logger.info(
            "DISPATCHING EMAIL to=%s subject=%r smtp=%s:%d",
            to_email,
            subject,
            settings.smtp_host,
            settings.smtp_port,
        )

        try:
            password = settings.smtp_password.get_secret_value() if hasattr(settings.smtp_password, "get_secret_value") else str(settings.smtp_password)
            await asyncio.to_thread(
                _send_smtp_sync,
                msg,
                settings.smtp_host,
                settings.smtp_port,
                settings.smtp_user,
                password,
                settings.smtp_tls,
            )
            logger.info("EMAIL DELIVERED to=%s via SMTP successfully", to_email)
            return True
        except Exception as exc:
            logger.warning(
                "SMTP delivery failed to %s:%d (%s). Falling back to console logging. Link in email body:\n%s",
                settings.smtp_host,
                settings.smtp_port,
                exc,
                text_content,
            )
            return False

    @classmethod
    async def send_verification_email(
        cls,
        to_email: str,
        token: str,
        base_url: Optional[str] = None,
    ) -> bool:
        """Send email verification link to user (Part D3)."""
        origin = (base_url or settings.oauth_redirect_base_url).rstrip("/")
        verification_link = f"{origin}/#verify-email?token={token}"

        subject = "Verify your ML Playground account"
        text_content = (
            f"Hello,\n\n"
            f"Thank you for registering with ML Playground. Please verify your email address by clicking the link below:\n\n"
            f"{verification_link}\n\n"
            f"This link will expire in 24 hours. If you did not create this account, you can safely ignore this email.\n\n"
            f"— ML Playground Team"
        )
        html_content = (
            f"<div style='font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;'>"
            f"<h2 style='color: #0f172a;'>Verify your ML Playground account</h2>"
            f"<p>Thank you for registering. Please click the button below to verify your email address and activate your account:</p>"
            f"<p style='margin: 28px 0;'>"
            f"<a href='{verification_link}' style='background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;'>"
            f"Verify Email Address"
            f"</a>"
            f"</p>"
            f"<p style='font-size: 13px; color: #64748b;'>Or copy and paste this link into your browser:<br>"
            f"<a href='{verification_link}' style='color: #2563eb;'>{verification_link}</a></p>"
            f"<p style='font-size: 12px; color: #94a3b8; margin-top: 32px;'>This link will expire in 24 hours. If you did not create this account, you can safely ignore this message.</p>"
            f"</div>"
        )
        return await cls.send_raw_email(to_email, subject, text_content, html_content)

    @classmethod
    async def send_password_reset_email(
        cls,
        to_email: str,
        token: str,
        base_url: Optional[str] = None,
    ) -> bool:
        """Send password reset instructions with single-use token (Part E1, E2)."""
        origin = (base_url or settings.oauth_redirect_base_url).rstrip("/")
        reset_link = f"{origin}/#reset-password?token={token}"

        subject = "Reset your ML Playground password"
        text_content = (
            f"Hello,\n\n"
            f"We received a request to reset the password for your ML Playground account.\n"
            f"You can choose a new password by clicking the link below:\n\n"
            f"{reset_link}\n\n"
            f"This link is single-use and will expire in 15 minutes.\n"
            f"If you did not request a password reset, please ignore this email or contact security.\n\n"
            f"— ML Playground Team"
        )
        html_content = (
            f"<div style='font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;'>"
            f"<h2 style='color: #0f172a;'>Reset your ML Playground password</h2>"
            f"<p>We received a request to reset your password. Click the button below to choose a new password:</p>"
            f"<p style='margin: 28px 0;'>"
            f"<a href='{reset_link}' style='background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;'>"
            f"Reset Password"
            f"</a>"
            f"</p>"
            f"<p style='font-size: 13px; color: #64748b;'>Or copy and paste this link into your browser:<br>"
            f"<a href='{reset_link}' style='color: #2563eb;'>{reset_link}</a></p>"
            f"<p style='font-size: 12px; color: #94a3b8; margin-top: 32px;'>This link is valid for 15 minutes. If you did not request this reset, your account is still secure and no changes were made.</p>"
            f"</div>"
        )
        return await cls.send_raw_email(to_email, subject, text_content, html_content)

    @classmethod
    async def send_duplicate_registration_notice(
        cls,
        to_email: str,
        base_url: Optional[str] = None,
    ) -> bool:
        """Notify existing account owner of an attempt to register their email (Part D2)."""
        origin = (base_url or settings.oauth_redirect_base_url).rstrip("/")
        login_link = f"{origin}/#login"
        forgot_link = f"{origin}/#forgot-password"

        subject = "Account notification: Registration attempt with your email"
        text_content = (
            f"Hello,\n\n"
            f"An attempt was made to register a new account on ML Playground using your email address ({to_email}).\n"
            f"Because you already have an account, no new account was created.\n\n"
            f"If you forgot your password, you can reset it here: {forgot_link}\n"
            f"Or you can sign in directly: {login_link}\n\n"
            f"If this wasn't you, someone may have entered your email address by mistake. Your account remains secure.\n\n"
            f"— ML Playground Team"
        )
        html_content = (
            f"<div style='font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;'>"
            f"<h2 style='color: #0f172a;'>Existing account notification</h2>"
            f"<p>An attempt was made to register a new ML Playground account using this email address. Since an account already exists, no changes were made.</p>"
            f"<p style='margin: 20px 0;'>"
            f"<a href='{login_link}' style='background: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-right: 12px; display: inline-block;'>"
            f"Sign In"
            f"</a>"
            f"<a href='{forgot_link}' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>"
            f"Reset Password"
            f"</a>"
            f"</p>"
            f"<p style='font-size: 12px; color: #94a3b8; margin-top: 32px;'>If you did not initiate this, you can safely disregard this email.</p>"
            f"</div>"
        )
        return await cls.send_raw_email(to_email, subject, text_content, html_content)


email_service = EmailService()
