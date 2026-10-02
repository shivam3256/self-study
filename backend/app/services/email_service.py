import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global in-memory list for testing/mock provider
mock_sent_emails: List[Dict[str, Any]] = []

def get_email_template(code: str, purpose: str = "signup_verify") -> tuple[str, str]:
    """
    Returns (html_content, plain_text_content) for the email.
    """
    purpose_title = "Verify your email address" if purpose == "signup_verify" else "Verification Code"
    purpose_desc = (
        "Welcome to StudyHub! To complete your library workspace setup and verify your email, "
        "please enter the 6-digit verification code below:"
    )

    plain_text = f"""StudyHub - {purpose_title}

{purpose_desc}

Your 6-Digit Code: {code}

This code will expire in {settings.OTP_EXPIRY_MINUTES} minutes.
If you did not request this verification code, please ignore this email.

---
StudyHub - Self-Study Center Management
"""

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{purpose_title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F5F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1F2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F7F5F2; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); overflow: hidden;" cellspacing="0" cellpadding="0" border="0">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #F3F4F6;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td style="width: 40px; height: 40px; background-color: #C2410C; border-radius: 8px; text-align: center; vertical-align: middle;">
                    <span style="color: #FFFFFF; font-size: 20px; font-weight: bold; line-height: 40px; display: inline-block;">🏛️</span>
                  </td>
                  <td style="padding-left: 12px; text-align: left;">
                    <span style="font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.5px;">StudyHub</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111827; text-align: center;">
                {purpose_title}
              </h1>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #4B5563; text-align: center;">
                {purpose_desc}
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #FFF7ED; border: 2px dashed #EA580C; border-radius: 10px; padding: 18px 36px; text-align: center;">
                      <span style="font-size: 36px; font-weight: 800; color: #C2410C; letter-spacing: 10px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; margin-left: 10px;">
                        {code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px; font-size: 13px; color: #6B7280; text-align: center;">
                ⏱️ This code will expire in <strong>{settings.OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9CA3AF; text-align: center;">
                If you did not request this verification code, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F9FAFB; border-top: 1px solid #F3F4F6; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
                &copy; 2026 StudyHub Management Platform. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return html_content, plain_text


class BaseEmailProvider:
    async def send(self, to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        raise NotImplementedError


class ConsoleEmailProvider(BaseEmailProvider):
    async def send(self, to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        logger.info(f"[EMAIL_SERVICE:Console] Sending email to: {to_email} | Subject: {subject}")
        if settings.DEBUG_LOG_OTP:
            print(f"\n==================== [STUDYHUB EMAIL TO: {to_email}] ====================")
            print(f"Subject: {subject}")
            print(plain_body)
            print("=========================================================================\n")
        return True


class MockEmailProvider(BaseEmailProvider):
    async def send(self, to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        mock_sent_emails.append({
            "to": to_email,
            "subject": subject,
            "html": html_body,
            "plain": plain_body
        })
        logger.info(f"[EMAIL_SERVICE:Mock] Recorded mock email to {to_email}")
        return True


def extract_email_address(from_str: str) -> str:
    """Extract clean email address from a string like 'LibMa <mail@trishshop.in>'."""
    import re
    match = re.search(r'[\w\.-]+@[\w\.-]+', from_str)
    return match.group(0) if match else from_str.strip()


class SMTPEmailProvider(BaseEmailProvider):
    async def send(self, to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        try:
            import asyncio
            def _send_sync():
                envelope_from = extract_email_address(settings.EMAIL_FROM)
                
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = settings.EMAIL_FROM
                msg["To"] = to_email

                part1 = MIMEText(plain_body, "plain", "utf-8")
                part2 = MIMEText(html_body, "html", "utf-8")
                msg.attach(part1)
                msg.attach(part2)

                logger.info(f"[EMAIL_SERVICE:SMTP] Connecting to {settings.SMTP_HOST}:{settings.SMTP_PORT}...")
                if settings.SMTP_PORT == 465:
                    server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                else:
                    server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                    if settings.SMTP_TLS:
                        server.starttls()

                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

                server.sendmail(envelope_from, [to_email], msg.as_string())
                server.quit()
                logger.info(f"[EMAIL_SERVICE:SMTP] Successfully dispatched email to {to_email} via Brevo/SMTP.")
                return True

            await asyncio.to_thread(_send_sync)
            return True
        except Exception as e:
            logger.error(f"[EMAIL_SERVICE:SMTP] Failed to send email to {to_email}: {e}")
            print(f"[EMAIL_SERVICE:SMTP ERROR] Could not deliver to {to_email}: {e}")
            return False


class EmailService:
    def get_provider(self) -> BaseEmailProvider:
        provider_name = settings.EMAIL_PROVIDER.lower()
        if provider_name == "smtp" and settings.SMTP_HOST:
            return SMTPEmailProvider()
        elif provider_name == "mock":
            return MockEmailProvider()
        else:
            return ConsoleEmailProvider()

    async def send_otp_email(self, to_email: str, code: str, purpose: str = "signup_verify") -> bool:
        subject = f"{code} is your StudyHub verification code"
        html_body, plain_body = get_email_template(code, purpose)
        provider = self.get_provider()
        return await provider.send(to_email, subject, html_body, plain_body)


email_service = EmailService()
