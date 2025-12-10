from fpdf import FPDF
from datetime import datetime

class PDF(FPDF):
    def header(self):
        # Couleur de fond de l'en-tête (Indigo CipherFlow)
        self.set_fill_color(99, 102, 241) 
        self.rect(0, 0, 210, 40, 'F')
        
        # Titre / Logo (En blanc)
        self.set_font('Helvetica', 'B', 24)
        self.set_text_color(255, 255, 255)
        self.cell(0, 20, 'CipherFlow', align='L', ln=1)
        
        # Sous-titre
        self.set_font('Helvetica', 'I', 10)
        self.cell(0, 5, 'L\'Intelligence Artificielle au service de votre business', align='L', ln=1)
        
        # Saut de ligne après l'en-tête
        self.ln(20)

    def footer(self):
        # Positionnement à 1.5 cm du bas
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        # Numéro de page
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}} - Genere par CipherFlow', align='C')

def clean_text(text):
    """Nettoie les caractères spéciaux pour éviter les crashs FPDF (Latin-1)"""
    if not text: return ""
    return str(text).encode('latin-1', 'replace').decode('latin-1')

def generate_pdf_bytes(data):
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    
    # --- 1. INFOS FACTURE (Cadre gris) ---
    pdf.set_text_color(0, 0, 0)
    pdf.set_fill_color(245, 247, 250) # Gris très clair
    pdf.rect(10, 50, 190, 35, 'F')
    
    pdf.set_y(55)
    pdf.set_font("Helvetica", "B", 14)
    # Ref et Date
    ref = clean_text(data.get('invoice_number', 'FAC-XXXX'))
    date = clean_text(data.get('date', datetime.now().strftime("%d/%m/%Y")))
    
    pdf.cell(95, 8, f"FACTURE N {ref}", ln=0, align='L')
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(95, 8, f"Date : {date}", ln=1, align='R')
    
    # Client
    pdf.ln(5)
    client = clean_text(data.get('client_name', 'Client Inconnu'))
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(20, 8, "Client :", ln=0)
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, client, ln=1)
    
    pdf.ln(20)

    # --- 2. TABLEAU DES PRESTATIONS ---
    # En-têtes du tableau
    pdf.set_fill_color(99, 102, 241) # Indigo
    pdf.set_text_color(255, 255, 255) # Blanc
    pdf.set_font("Helvetica", "B", 11)
    
    # Largeurs des colonnes
    w_desc = 140
    w_price = 50
    
    pdf.cell(w_desc, 10, "Description", border=0, fill=True, align='L')
    pdf.cell(w_price, 10, "Montant (EUR)", border=0, fill=True, align='R')
    pdf.ln()

    # Lignes du tableau
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 11)
    
    items = data.get('items', [])
    total = 0.0
    fill = False # Pour alterner les couleurs de fond (zébré)
    
    for item in items:
        # Couleur de fond alternée
        if fill:
            pdf.set_fill_color(245, 247, 250)
        else:
            pdf.set_fill_color(255, 255, 255)
            
        desc = clean_text(item.get('desc', 'Service'))
        # Nettoyage prix (enlève € et espaces)
        price_raw = str(item.get('price', '0')).replace('€', '').replace('EUR', '').strip()
        try:
            val = float(price_raw)
        except:
            val = 0.0
        total += val
        
        pdf.cell(w_desc, 10, f" {desc}", border=0, fill=True, align='L')
        pdf.cell(w_price, 10, f"{val:.2f}   ", border=0, fill=True, align='R')
        pdf.ln()
        fill = not fill # Inverse pour la prochaine ligne

    # --- 3. TOTAL ---
    pdf.ln(5)
    # Ligne de séparation
    pdf.set_draw_color(99, 102, 241)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(w_desc, 10, "TOTAL A PAYER", align='R')
    
    # Fond coloré pour le total
    pdf.set_fill_color(224, 231, 255) # Indigo très clair
    pdf.set_text_color(67, 56, 202) # Indigo foncé
    pdf.cell(w_price, 10, f"{total:.2f} EUR   ", border=0, fill=True, align='R')

    # --- 4. PIED DE PAGE LÉGAL ---
    pdf.set_y(-40)
    pdf.set_text_color(100, 100, 100)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, clean_text("Conditions de paiement : Reception de facture. \nMerci de votre confiance."), align='C')

    return bytes(pdf.output())