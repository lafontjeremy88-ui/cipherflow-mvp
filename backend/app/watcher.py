import time
import imaplib
import email
from email.header import decode_header
import requests
import os
import logging
import socket

# --- CONFIGURATION ---
IMAP_SERVER = "imap.gmail.com"
EMAIL_USER = "cipherflow.services@gmail.com"
EMAIL_PASS = "cdtg lyfo dtqw cxvw" 

# URL API (Webhook)
API_URL = "https://cipherflow-mvp-production.up.railway.app/webhook/email"
WATCHER_SECRET = "CLE_SECRETE_WATCHER_123"

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")

# Liste des expéditeurs à IGNORER (Anti-Spam / Anti-Bot)
BLACKLIST_SENDERS = ["railway", "google", "no-reply", "noreply", "donotreply", "microsoft", "github"]

def get_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if content_type == "text/plain" and "attachment" not in content_disposition:
                return part.get_payload(decode=True).decode()
    else:
        return msg.get_payload(decode=True).decode()
    return ""

def clean_subject(subject_raw):
    decoded_list = decode_header(subject_raw)
    subject = ""
    for decoded_bytes, charset in decoded_list:
        if isinstance(decoded_bytes, bytes):
            try:
                subject += decoded_bytes.decode(charset or 'utf-8')
            except:
                subject += decoded_bytes.decode('latin-1')
        else:
            subject += str(decoded_bytes)
    return subject

def watch_emails():
    print("👀 WATCHER DÉMARRÉ : Surveillance de la boîte de réception...")
    
    while True:
        mail = None
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            mail.select("inbox")

            status, messages = mail.search(None, 'UNSEEN')
            
            if not messages or messages[0] is None:
                email_ids = []
            else:
                all_ids = messages[0].split()
                # On ne prend que les 5 derniers pour éviter l'embouteillage au démarrage
                email_ids = all_ids[-5:]

            if email_ids:
                print(f"📬 {len(email_ids)} emails détectés (Traitement en cours...)")

            for e_id in email_ids:
                try:
                    res, msg_data = mail.fetch(e_id, "(RFC822)")
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            msg = email.message_from_bytes(response_part[1])
                            subject = clean_subject(msg["Subject"])
                            real_sender = msg.get("From", "")
                            body = get_body(msg)

                            # --- FILTRE ANTI-ROBOT ---
                            sender_lower = real_sender.lower()
                            if any(blocked in sender_lower for blocked in BLACKLIST_SENDERS):
                                print(f"   🚫 Ignoré (Robot détecté) : {subject}")
                                continue

                            print(f"   👉 Traitement de : {subject}")
                            
                            payload = {
                                "from_email": real_sender,
                                "subject": subject,
                                "content": body or "Pas de contenu texte",
                                "send_email": True 
                            }
                            headers = {"x-watcher-secret": WATCHER_SECRET}
                            
                            # Appel API
                            response = requests.post(API_URL, json=payload, headers=headers)
                            
                            if response.status_code == 200:
                                print(f"      ✅ SUCCÈS ! Email traité et répondu.")
                            else:
                                print(f"      ⚠️ Échec API ({response.status_code}) : {response.text}")
                    
                    # --- PAUSE CRITIQUE ---
                    # On attend 2 secondes entre chaque mail pour ne pas tuer le serveur
                    time.sleep(2)

                except Exception as e_loop:
                    print(f"   ❌ Erreur sur un email : {e_loop}")

            try:
                mail.close()
                mail.logout()
            except: pass
            
            time.sleep(10)

        except Exception as e:
            print(f"⚠️ Erreur Globale Watcher : {e}")
            time.sleep(30)

if __name__ == "__main__":
    watch_emails()