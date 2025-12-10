import time
import imaplib
import email
from email.header import decode_header
import requests
import os
import logging

# --- CONFIGURATION ---
IMAP_SERVER = "imap.gmail.com"
EMAIL_USER = "cipherflow.services@gmail.com"
EMAIL_PASS = "cdtg lyfo dtqw cxvw" 

# Ton URL API (Webhook)
API_URL = "https://cipherflow-mvp-production.up.railway.app/webhook/email"
WATCHER_SECRET = "CLE_SECRETE_WATCHER_123"

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")

# LISTE NOIRE : On ignore ces expéditeurs
BLACKLIST = ["railway", "google", "no-reply", "noreply", "postmaster", "mailer-daemon", "resend"]

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
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            mail.select("inbox")

            status, messages = mail.search(None, 'UNSEEN')
            
            if not messages or messages[0] is None:
                email_ids = []
            else:
                all_ids = messages[0].split()
                # On ne prend que les 3 derniers pour éviter l'embouteillage
                email_ids = all_ids[-3:]

            if email_ids:
                print(f"📬 {len(email_ids)} emails détectés...")

            for e_id in email_ids:
                try:
                    res, msg_data = mail.fetch(e_id, "(RFC822)")
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            msg = email.message_from_bytes(response_part[1])
                            subject = clean_subject(msg["Subject"])
                            real_sender = msg.get("From", "")
                            
                            # --- FILTRE ANTI-ROBOT ---
                            is_spam = False
                            for blocked in BLACKLIST:
                                if blocked in real_sender.lower() or blocked in subject.lower():
                                    is_spam = True
                            
                            if is_spam:
                                print(f"   🚫 Ignoré (Robot): {subject}")
                                continue
                                
                            body = get_body(msg)
                            print(f"   👉 Traitement de : {subject}")
                            print(f"      📨 De : {real_sender}")

                            payload = {
                                "from_email": real_sender, # L'API essaiera de répondre à ça
                                "subject": subject,
                                "content": body or "Pas de contenu texte",
                                "send_email": True 
                            }
                            headers = {"x-watcher-secret": WATCHER_SECRET}
                            
                            response = requests.post(API_URL, json=payload, headers=headers)
                            
                            if response.status_code == 200:
                                print(f"      ✅ SUCCÈS ! Email envoyé à l'IA.")
                            else:
                                print(f"      ⚠️ Échec API ({response.status_code})")
                    
                    # Pause de 2 secondes pour laisser respirer l'API
                    time.sleep(2)

                except Exception as e_loop:
                    print(f"   ❌ Erreur mail: {e_loop}")

            try:
                mail.close(); mail.logout()
            except: pass
            
        except Exception as e:
            print(f"⚠️ Erreur Globale: {e}")
        
        time.sleep(10)

if __name__ == "__main__":
    watch_emails()