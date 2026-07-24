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

china_time = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
message = EmailMessage()
message["From"] = f"冰川信使 <{from_email}>"
message["To"] = to_email
message["Subject"] = f"冰川信使 · {china_time} 每日文献摘要"
message.set_content("请使用支持 HTML 的邮件客户端查看每日文献摘要。")
message.add_alternative(html_path.read_text(encoding="utf-8"), subtype="html")

with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ssl.create_default_context()) as server:
    server.login(from_email, auth_code)
    server.send_message(message)

print(f"Sent digest to {to_email} through {smtp_host}:{smtp_port}.")
