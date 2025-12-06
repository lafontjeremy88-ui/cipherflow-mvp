import sys
import os
# Ajoute le dossier courant au chemin de recherche de Python
sys.path.append(os.getcwd())
from app.pdf_service import generate_pdf_bytes

# Données factices pour tester
fake_data = {
    "company_name": "CipherFlow Garage",
    "client_email": "client.test@gmail.com",
    "items": [
        {"description": "Changement Pneus", "quantity": 4, "unit_price": 80.0},
        {"description": "Vidange", "quantity": 1, "unit_price": 50.0}
    ]
}

print("⏳ Génération du PDF en cours...")
try:
    pdf_content = generate_pdf_bytes(fake_data)
    
    # Sauvegarde sur le disque pour vérifier
    with open("test_result.pdf", "wb") as f:
        f.write(pdf_content)
        
    print("✅ SUCCÈS ! Le fichier 'test_result.pdf' a été créé.")
except Exception as e:
    print("❌ ERREUR :", e)
    print("Il est probable qu'il manque GTK3 sur Windows.")