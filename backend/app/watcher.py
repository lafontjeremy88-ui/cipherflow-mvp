import time
import imaplib
import email
from email.header import decode_header
import requests
import os
import logging

# --- CONFIGURATION GMAIL VIA VARIABLES D'ENV ---

IMAP_SERVER = os.getenv("IMAP_HOST", "imap.gmail.com")
EMAIL_USER = os.environ["IMAP_USER"]          # ex: lafontjeremy88@gmail.com
EMAIL_PASS = os.environ["IMAP_PASSWORD"]      # mot de passe d'application

# --- CONFIGURATION API (BACKEND CIPHERFLOW) ---

BACKEND_URL = os.environ["BACKEND_URL"].rstrip("/")   # ex: https://cipherflow-mvp-production.up.railway.app
API_URL = f"{BACKEND_URL}/webhook/email"

WATCHER_SECRET = os.environ["WATCHER_SECRET"]         # même valeur que dans le backend

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")


def get_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if content_type == "text/plain" and "attachment" not in content_disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(errors="ignore")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode(errors="ignore")
    return ""


def clean_subject(subject_raw):
    if not subject_raw:
        return ""
    decoded_list = decode_header(subject_raw)
    subject = ""
    for decoded_bytes, charset in decoded_list:
        if isinstance(decoded_bytes, bytes):
            try:
                subject += decoded_bytes.decode(charset or "utf-8", errors="ignore")
            except Exception:
                subject += decoded_bytes.decode("latin-1", errors="ignore")
        else:
            subject += str(decoded_bytes)
    return subject


def watch_emails():
    print("👀 WATCHER DÉMARRÉ : Surveillance de la boîte de réception...")

    while True:
        mail = None
        try:
            # 1. Connexion IMAP
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            mail.select("inbox")

            # 2. Emails non lus
            status, messages = mail.search(None, "UNSEEN")

            email_ids = messages[0].split() if messages and messages[0] else []

            if email_ids:
                print(f"📬 {len(email_ids)} nouveaux emails détectés !")

            for e_id in email_ids:
                # 3. Lecture du mail
                res, msg_data = mail.fetch(e_id, "(RFC822)")
                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        subject = clean_subject(msg.get("Subject"))
                        real_sender = msg.get("From")
                        body = get_body(msg)

                        print(f"   👉 Traitement de : {subject}")
                        print(f"      📨 De : {real_sender}")

                        # 4. Envoi au backend
                        payload = {
                            "from_email": real_sender,
                            "subject": subject or "(sans objet)",
                            "content": body or "Pas de contenu texte",
                            "send_email": True,
                        }

                        headers = {"x-watcher-secret": WATCHER_SECRET}

                        try:
                            print("      🚀 Envoi à l'IA en cours...")
                            response = requests.post(API_URL, json=payload, headers=headers, timeout=20)

                            if response.status_code == 200:
                                print("      ✅ SUCCÈS ! Email traité et répondu.")
                            else:
                                print(f"      ⚠️ Échec API ({response.status_code}) : {response.text}")

                        except Exception as e_api:
                            print(f"      ❌ Erreur de connexion API : {e_api}")

            # Fermeture propre
            try:
                mail.close()
                mail.logout()
            except Exception:
                pass

            time.sleep(10)

        except Exception as e:
            print(f"⚠️ Erreur Watcher : {e}")
            time.sleep(30)


if __name__ == "__main__":
    watch_emails()
