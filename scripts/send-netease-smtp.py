import os
import smtplib
import ssl
import sys
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from pathlib import Path


html_path = Path(sys.argv[1] if len(sys.argv) > 1 else "daily-digest.html")
smtp_host = os.environ.get("SMTP_HOST", "smtp.163.com")
smtp_port = int(os.environ.get("SMTP_PORT", "465"))
from_email = os.environ["SMTP_FROM_EMAIL"]
to_email = os.environ["SMTP_TO_EMAIL"]
auth_code = os.environ["NETEASE_SMTP_AUTH_CODE"]
requested_days = int(os.environ.get("DIGEST_DAYS", "1"))
digest_days = min(14, max(1, requested_days))
profile_id = os.environ.get("DIGEST_PROFILE", "").strip()
profile_names = {
    "su-haiyang": "苏海洋",
    "yang-yaru": "杨雅茹",
    "he-rui": "何锐",
}
profile_name = profile_names.get(profile_id)
is_preview = os.environ.get("DIGEST_PREVIEW", "false").lower() == "true"

china_time = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
message = EmailMessage()
message["From"] = f"\u51b0\u5ddd\u4fe1\u4f7f <{from_email}>"
message["To"] = to_email
subject = f"\u51b0\u5ddd\u4fe1\u4f7f \u00b7 {china_time} \u8fd1{digest_days}\u5929\u6587\u732e\u6458\u8981"
if profile_name:
    subject = f"\u51b0\u5ddd\u4fe1\u4f7f \u00b7 {profile_name}\u4e2a\u6027\u5316\u6587\u732e\u6458\u8981 · {china_time}"
if is_preview:
    subject = f"[\u8bd5\u53d1] {subject}"
message["Subject"] = subject
message.set_content("Please use an HTML-capable mail client to view this literature digest.")
message.add_alternative(html_path.read_text(encoding="utf-8"), subtype="html")

with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ssl.create_default_context()) as server:
    server.login(from_email, auth_code)
    server.send_message(message)

print(f"Sent {profile_name or 'default'} {digest_days}-day digest to {to_email} through {smtp_host}:{smtp_port}.")
