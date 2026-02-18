# app/api/invoice_routes.py
"""
Routes facturation / quittances PDF.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.database.database import get_db
from app.database.models import AppSettings, Invoice, User
from app.pdf_service import generate_pdf_bytes

router = APIRouter(tags=["Invoices"])


class InvoiceItem(BaseModel):
    desc: str
    price: float

class InvoiceRequest(BaseModel):
    client_name: str
    invoice_number: str
    amount: float
    date: str
    items: List[InvoiceItem]


@router.post("/api/generate-invoice")
async def gen_inv(
    req: InvoiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id
    s = db.query(AppSettings).filter(AppSettings.agency_id == aid).first()

    data = req.dict()
    data.update({
        "company_name_header": s.company_name if s else "Agence",
        "logo_url": s.logo if (s and s.logo) else None,
    })

    import json
    db.add(Invoice(
        agency_id=aid,
        reference=req.invoice_number,
        amount=str(req.amount),
    ))
    db.commit()

    pdf_bytes = generate_pdf_bytes(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=facture_{req.invoice_number}.pdf"},
    )


@router.get("/api/invoices")
async def list_inv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    return db.query(Invoice).filter(Invoice.agency_id == current_user.agency_id).order_by(Invoice.id.desc()).all()


@router.delete("/api/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    inv = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.agency_id == current_user.agency_id,
    ).first()
    if not inv:
        raise HTTPException(404, "Quittance introuvable ou accès refusé")
    db.delete(inv)
    db.commit()
    return {"status": "deleted"}
