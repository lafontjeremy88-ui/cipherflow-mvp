import os
import io
from jinja2 import Environment, FileSystemLoader
from xhtml2pdf import pisa  # Nouvelle bibliothèque 100% Python

def generate_pdf_bytes(data):
    """
    Génère un PDF (en bytes) avec xhtml2pdf.
    Solution compatible Windows sans installation externe.
    """
    
    # 1. GESTION DES CHEMINS
    current_dir = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(current_dir, 'templates')
    
    if not os.path.exists(template_dir):
        raise FileNotFoundError(f"Dossier templates introuvable : {template_dir}")

    # 2. CONFIGURATION JINJA2
    env = Environment(loader=FileSystemLoader(template_dir))
    try:
        template = env.get_template('invoice.html')
    except Exception as e:
        raise FileNotFoundError(f"Impossible de trouver 'invoice.html'. Erreur: {e}")

    # 3. GÉNÉRATION DU HTML
    html_content = template.render(data)

    # 4. CONVERSION EN PDF (Via xhtml2pdf)
    # On prépare un tampon mémoire pour recevoir le PDF
    pdf_buffer = io.BytesIO()
    
    # On génère le PDF
    pisa_status = pisa.CreatePDF(
        src=html_content,     # Le contenu HTML
        dest=pdf_buffer       # La destination (mémoire)
    )

    # Vérification d'erreurs
    if pisa_status.err:
        raise Exception(f"Erreur lors de la génération PDF : {pisa_status.err}")

    # On rembobine le tampon au début pour pouvoir le lire
    pdf_buffer.seek(0)
    
    return pdf_buffer.read()