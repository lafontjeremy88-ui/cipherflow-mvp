from fpdf import FPDF
from datetime import datetime
import requests
import os

class PDF(FPDF):
    def __init__(self, header_data):
        super().__init__()
        self.header_data = header_data

    def header(self):
        # Couleur de fond (Indigo)
        self.set_fill_color(99, 102, 241) 
        self.rect(0, 0, 210, 40, 'F')
        
        # --- LOGO (Dynamique via URL) ---
        logo_url = self.header_data.get('logo_url')
        if logo_url:
            try:
                # Astuce : On télécharge l'image temporairement pour l'afficher
                response = requests.get(logo_url)
                if response.status_code == 200:
                    with open('temp_logo.png', 'wb') as f:
                        f.write(response.content)
                    # Affichage du logo (x=10, y=8, largeur=20)
                    self.image('temp_logo.png', 10, 8, 20)
            except:
                pass # Si le logo échoue, on continue sans planter

        # --- NOM ENTREPRISE (Dynamique) ---
        company_name = self.header_data.get('company_name_header', 'CipherFlow')
        
        self.set_font('Helvetica', 'B', 24)
        self.set_text_color(255, 255, 255)
        # On décale le texte si y'a un logo (x=35), sinon au bord (x=10)
        self.set_xy(35, 10)
        self.cell(0, 15, clean_text(company_name), ln=1)
        
        # Sous-titre
        self.set_font('Helvetica', 'I', 10)
        self.set_xy(35, 22)
        self.cell(0, 5, 'Genere automatiquement par IA', align='L')
        
        self.ln(20)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

def clean_text(text):
    if not text: return ""
    # Nettoyage robuste des caractères non supportés par Latin-1
    text = str(text).replace('€', 'EUR').replace('’', "'")
    return text.encode('latin-1', 'replace').decode('latin-1')

def generate_pdf_bytes(data):
    # On passe les données (Nom entreprise, Logo) au constructeur PDF
    pdf = PDF(header_data=data)
    pdf.alias_nb_pages()
    pdf.add_page()
    
    # --- 1. INFOS FACTURE ---
    pdf.set_text_color(0, 0, 0)
    pdf.set_fill_color(245, 247, 250)
    pdf.rect(10, 50, 190, 35, 'F')
    
    pdf.set_y(55)
    pdf.set_font("Helvetica", "B", 14)
    
    ref = clean_text(data.get('invoice_number', 'FAC-XXXX'))
    date = clean_text(data.get('date', datetime.now().strftime("%d/%m/%Y")))
    
    pdf.cell(95, 8, f"FACTURE N {ref}", ln=0, align='L')
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(95, 8, f"Date : {date}", ln=1, align='R')
    
    pdf.ln(5)
    client = clean_text(data.get('client_name', 'Client'))
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(20, 8, "Client :", ln=0)
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, client, ln=1)
    
    pdf.ln(20)

    # --- 2. TABLEAU ---
    pdf.set_fill_color(99, 102, 241)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 11)
    
    w_desc = 140
    w_price = 50
    
    pdf.cell(w_desc, 10, "Description", border=0, fill=True, align='L')
    pdf.cell(w_price, 10, "Montant (EUR)", border=0, fill=True, align='R')
    pdf.ln()

    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 11)
    
    items = data.get('items', [])
    total = 0.0
    fill = False
    
    for item in items:
        if fill: pdf.set_fill_color(245, 247, 250)
        else: pdf.set_fill_color(255, 255, 255)
            
        desc = clean_text(item.get('desc', 'Service'))
        price_raw = str(item.get('price', '0')).replace('€', '').replace('EUR', '').strip()
        try: val = float(price_raw)
        except: val = 0.0
        total += val
        
        pdf.cell(w_desc, 10, f" {desc}", border=0, fill=True, align='L')
        pdf.cell(w_price, 10, f"{val:.2f}   ", border=0, fill=True, align='R')
        pdf.ln()
        fill = not fill

    # --- 3. TOTAL ---
    pdf.ln(5)
    pdf.set_draw_color(99, 102, 241)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(w_desc, 10, "TOTAL", align='R')
    
    pdf.set_fill_color(224, 231, 255)
    pdf.set_text_color(67, 56, 202)
    pdf.cell(w_price, 10, f"{total:.2f} EUR   ", border=0, fill=True, align='R')

    # --- 4. PIED DE PAGE ---
    pdf.set_y(-40)
    pdf.set_text_color(100, 100, 100)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, clean_text("Merci de votre confiance."), align='C')

    # Nettoyage fichier temporaire logo
    if os.path.exists('temp_logo.png'):
        os.remove('temp_logo.png')

    return bytes(pdf.output())