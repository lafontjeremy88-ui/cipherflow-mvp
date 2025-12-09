import smtplib
from email.message import EmailMessage

# --- VOS INFOS À REMPLACER ---
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USERNAME = "cipherflow.services@gmail.com"  # <--- METTEZ VOTRE EMAIL ICI
# LE PLUS IMPORTANT : Collez le code à 16 lettres ici (pas votre mot de passe habituel)
SMTP_PASSWORD = "cdtg lyfo dtqw cxvw"    # <--- VOTRE MOT DE PASSE D'APPLICATION

def test_envoi():
    print(f"1. Tentative de connexion à {SMTP_HOST}...")
    
    msg = EmailMessage()
    msg["From"] = SMTP_USERNAME
    msg["To"] = SMTP_USERNAME  # On s'envoie le mail à soi-même pour tester
    msg["Subject"] = "Test de connexion SMTP CipherFlow"
    msg.set_content("Si vous lisez ceci, c'est que le mot de passe d'application est VALIDE !")

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            # Cette ligne permet de voir les détails techniques de la connexion
            server.set_debuglevel(1)
            
            print("2. Démarrage TLS (Sécurité)...")
            server.starttls()
            
            print("3. Authentification (Login)...")
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            
            print("4. Envoi du message...")
            server.send_message(msg)
            
        print("\n✅ SUCCÈS ! L'email est parti. Vos identifiants sont bons.")
        print("   -> Vous pouvez copier ce mot de passe dans Railway.")

    except Exception as e:
        print(f"\n❌ ÉCHEC : Une erreur est survenue.")
        print(f"   Message d'erreur : {e}")
        print("\nCONSEILS :")
        print("1. Vérifiez que vous utilisez un 'Mot de passe d'application' (16 lettres).")
        print("2. Vérifiez que l'adresse email est correcte.")
        print("3. Vérifiez votre connexion internet.")

if __name__ == "__main__":
    test_envoi()