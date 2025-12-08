from fpdf import FPDF

def generate_pdf_bytes(data):
    """
    Génère un PDF. Remplace automatiquement € par EUR pour éviter les crashs.
    """
    pdf = FPDF()
    pdf.add_page()
    
    # 1. En-tête
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 10, "FACTURE", new_x="LMARGIN", new_y="NEXT", align='C')
    pdf.ln(10)

    # 2. Infos Client
    pdf.set_font("Helvetica", "", 12)
    # On nettoie les accents basiques pour éviter les erreurs d'encodage
    def clean_text(text):
        return str(text).encode('latin-1', 'replace').decode('latin-1')

    client = clean_text(data.get('client_name', 'Client'))
    ref = clean_text(data.get('invoice_number', 'N/A'))
    date = clean_text(data.get('date', 'N/A'))
    
    pdf.cell(0, 10, f"Ref : {ref}", new_x="LMARGIN", new_y="NEXT", align='R')
    pdf.cell(0, 10, f"Date : {date}", new_x="LMARGIN", new_y="NEXT", align='R')
    pdf.ln(5)
    
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 10, f"Client : {client}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    # 3. Tableau
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(130, 10, "Description", border=1, fill=True)
    pdf.cell(60, 10, "Prix (EUR)", border=1, fill=True, new_x="LMARGIN", new_y="NEXT", align='R')

    pdf.set_font("Helvetica", "", 12)
    items = data.get('items', [])
    total = 0.0
    
    for item in items:
        desc = clean_text(item.get('desc', 'Service'))
        # IMPORTANT : On retire le symbole € avant de convertir
        price_raw = str(item.get('price', '0')).replace('€', '').strip()
        
        try:
            val = float(price_raw)
        except:
            val = 0.0
        total += val
        
        pdf.cell(130, 10, desc, border=1)
        # On affiche "EUR" au lieu du symbole €
        pdf.cell(60, 10, f"{val:.2f} EUR", border=1, new_x="LMARGIN", new_y="NEXT", align='R')

    # Total
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(130, 10, "TOTAL", align='R')
    pdf.cell(60, 10, f"{total:.2f} EUR", border=1, align='R', fill=True)

    # Pied de page
    pdf.set_y(-30)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 10, "Document genere par CipherFlow.", align='C')

    return bytes(pdf.output())