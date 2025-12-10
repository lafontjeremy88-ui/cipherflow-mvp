import time
import imaplib
import email
from email.header import decode_header
import requests
import os
import logging
import socket

# --- CONFIGURATION GMAIL (LECTURE) ---
IMAP_SERVER = "imap.gmail.com"
EMAIL_USER = "cipherflow.services@gmail.com"
# Code app Gmail (le même que pour SMTP)
EMAIL_PASS = "cdtg lyfo dtqw cxvw" 

# --- CONFIGURATION API ---
# On tape sur la route Webhook spéciale
API_URL = "[https://cipherflow-mvp-production.up.railway.app/webhook/email](https://cipherflow-mvp-production.up.railway.app/webhook/email)"
# La clé secrète doit être identique à celle dans main.py
WATCHER_SECRET = "CLE_SECRETE_WATCHER_123"

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")

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
            # 1. Connexion IMAP
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            mail.select("inbox")

            # 2. Recherche emails non lus
            status, messages = mail.search(None, 'UNSEEN')
            
            if not messages or messages[0] is None:
                email_ids = []
            else:
                email_ids = messages[0].split()

            if email_ids:
                print(f"📬 {len(email_ids)} nouveaux emails détectés !")

            for e_id in email_ids:
                # 3. Lecture
                res, msg_data = mail.fetch(e_id, "(RFC822)")
                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        subject = clean_subject(msg["Subject"])
                        real_sender = msg.get("From")
                        body = get_body(msg)

                        print(f"   👉 Traitement de : {subject}")
                        print(f"      📨 De : {real_sender}")

                        # 4. Envoi à l'API (Via Webhook)
                        payload = {
                            "from_email": real_sender,
                            "subject": subject,
                            "content": body or "Pas de contenu texte",
                            "send_email": True 
                        }
                        
                        # On ajoute la clé secrète dans l'en-tête
                        headers = {"x-watcher-secret": WATCHER_SECRET}
                        
                        try:
                            print("      🚀 Envoi à l'IA en cours...")
                            response = requests.post(API_URL, json=payload, headers=headers)
                            
                            if response.status_code == 200:
                                print(f"      ✅ SUCCÈS ! Email traité et répondu.")
                            else:
                                print(f"      ⚠️ Échec API ({response.status_code}) : {response.text}")

                        except Exception as e_api:
                            print(f"      ❌ Erreur de connexion API : {e_api}")

            try:
                mail.close()
                mail.logout()
            except: pass
            
            time.sleep(10)

        except Exception as e:
            print(f"⚠️ Erreur Watcher : {e}")
            time.sleep(30) # Pause plus longue en cas d'erreur réseau

if __name__ == "__main__":
    watch_emails()