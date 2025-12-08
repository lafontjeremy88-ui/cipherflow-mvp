from fpdf import FPDF

def generate_pdf_bytes(data):
    """
    Génère un PDF simple et propre avec FPDF2 (100% Python, pas de dépendances système).
    """
    # 1. Création du document
    pdf = FPDF()
    pdf.add_page()
    
    # 2. En-tête
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 10, "FACTURE", new_x="LMARGIN", new_y="NEXT", align='C')
    pdf.ln(10) # Saut de ligne

    # 3. Infos Client et Facture
    pdf.set_font("Helvetica", "", 12)
    
    # Numéro et Date (Aligné à droite astuce : on écrit, puis on revient)
    pdf.cell(0, 10, f"N° Facture : {data.get('invoice_number', 'N/A')}", new_x="LMARGIN", new_y="NEXT", align='R')
    pdf.cell(0, 10, f"Date : {data.get('date', 'N/A')}", new_x="LMARGIN", new_y="NEXT", align='R')
    
    pdf.ln(5)
    
    # Client (A gauche)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 10, f"Client : {data.get('client_name', 'Client')}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    # 4. Tableau des articles
    # En-têtes du tableau
    pdf.set_fill_color(240, 240, 240) # Gris clair
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(130, 10, "Description", border=1, fill=True)
    pdf.cell(60, 10, "Prix", border=1, fill=True, new_x="LMARGIN", new_y="NEXT", align='R')

    # Contenu du tableau
    pdf.set_font("Helvetica", "", 12)
    items = data.get('items', [])
    
    total = 0.0
    for item in items:
        desc = item.get('desc', 'Service')
        price_str = str(item.get('price', '0')).replace('€', '').strip()
        try:
            price = float(price_str)
        except:
            price = 0.0
        
        total += price
        
        pdf.cell(130, 10, desc, border=1)
        pdf.cell(60, 10, f"{price:.2f} €", border=1, new_x="LMARGIN", new_y="NEXT", align='R')

    # 5. Total
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(130, 10, "TOTAL", align='R')
    pdf.cell(60, 10, f"{total:.2f} €", border=1, align='R', fill=True)

    # 6. Pied de page
    pdf.set_y(-30)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 10, "Merci de votre confiance. Document généré automatiquement par CipherFlow.", align='C')

    # 7. Retourner les bytes
    return bytes(pdf.output())