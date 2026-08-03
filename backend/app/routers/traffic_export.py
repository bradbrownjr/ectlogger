"""
Export endpoints for a single form: plaintext (the ported RRI/NTS/ICS-213
formatter) and a printable PDF. Also the stateless import-preview endpoint --
grouped here rather than in its own router because section 3.4 of the design
doc places both under this file's table, and both are read-only operations
on the same formatter layer (export renders a Form to text; import parses
text back into fields). See TRAFFIC-HANDLING-DESIGN.md section 3.4.

No email-send endpoint exists here or anywhere else in this phase. A "send
it for me" convenience was designed and then explicitly rejected by the
roadmap author (see section 0's positioning constraint and Risk R7,
resolved): ECTLogger never sends traffic itself. Emailing an addressee is
logged the same way every other delivery method is -- as a traffic_log.py
entry with method = RelayMethod.EMAIL, once that router lands -- after the
operator sends it themselves through their own email client.
"""
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Form, User
from app.permissions import FormPermissionResult, check_form_permission
from app.schemas import ImportPreviewRequest, ImportPreviewResponse
from app.traffic.formatters import format_form, parse_any

router = APIRouter(tags=["traffic-export"])

_PAGE_MARGIN = 54  # points, 0.75 inch
_LINE_HEIGHT = 12
_CHARS_PER_LINE = 100  # Courier 10pt fits ~100 chars in a letter-width line minus margins


def _export_filename(form: Form, extension: str) -> str:
    number = form.message_number or str(form.id)
    return f"{form.form_type}_{number}.{extension}"


def _render_pdf(text: str, title: str) -> bytes:
    """Render *text* onto a simple, multi-page-if-needed letter-size PDF in a
    monospace font, matching a printable radiogram/ICS-213 pad. Follows the
    StreamingResponse idiom already used by nets_export.py's ICS-309 export,
    but returns a real binary PDF body since this is the printable copy an
    operator files or hands to the addressee, not a log."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    def _new_page(draw_title: bool) -> float:
        y = height - _PAGE_MARGIN
        if draw_title:
            pdf.setFont("Courier-Bold", 12)
            pdf.drawString(_PAGE_MARGIN, y, title)
            y -= _LINE_HEIGHT * 2
        pdf.setFont("Courier", 10)
        return y

    y = _new_page(draw_title=True)
    for line in (text.splitlines() or ['']):
        if y < _PAGE_MARGIN:
            pdf.showPage()
            y = _new_page(draw_title=False)
        pdf.drawString(_PAGE_MARGIN, y, line[:_CHARS_PER_LINE])
        y -= _LINE_HEIGHT
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


@router.get("/forms/{form_id}/export")
async def export_form(
    form_id: int,
    format: str = Query("text"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a single form as plaintext (?format=text, the default) or a
    printable PDF (?format=pdf). View permission only."""
    if format not in ("text", "pdf"):
        raise HTTPException(status_code=400, detail="format must be 'text' or 'pdf'")

    result = await db.execute(
        select(Form).options(selectinload(Form.definition)).where(Form.id == form_id)
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    perm = await check_form_permission(db, form, current_user, "view")
    if perm == FormPermissionResult.DENIED:
        raise HTTPException(status_code=403, detail="Not authorized to export this form")

    text = format_form(form)

    if format == "text":
        return StreamingResponse(
            iter([text]),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{_export_filename(form, "txt")}"'},
        )

    title_number = f" NR {form.message_number}" if form.message_number else ""
    pdf_bytes = _render_pdf(text, f"{form.definition.title}{title_number}")
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_export_filename(form, "pdf")}"'},
    )


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def import_preview(
    data: ImportPreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """Stateless parse-only preview of pasted/uploaded traffic text
    (TRAFFIC-HANDLING-DESIGN.md D5 and section 3.4). Any authenticated user
    may call this -- no permission check beyond auth, because it writes
    nothing to the database under any input. formatters.parse_any() is the
    only parsing entry point (per its own docstring, the registry is the
    only place allowed to branch on form type); this handler does nothing
    but call it and translate its one hard-failure case (empty or
    oversized input) into a 400.

    The operator reviews the result in ImportPreview.tsx and, if satisfied,
    confirms into the ordinary FormRenderer/RadiogramAssist pre-filled --
    the real POST /traffic/forms is the only thing that ever commits.
    """
    try:
        result = parse_any(data.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ImportPreviewResponse(**result)
