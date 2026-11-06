from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.expense_type import ExpenseType
from app.models.user import User
from app.schemas.receipt import ReceiptParseResponse, ReceiptTextRequest
from app.services.ocr import OCRUnavailableError, get_ocr_provider, validate_image_bytes
from app.services.receipt_parser import get_receipt_parser

router = APIRouter(prefix="/receipts", tags=["Receipts"])


@router.post(
    "/parse",
    response_model=ReceiptParseResponse,
    summary="Parse a receipt image or raw text into structured expense data",
)
async def parse_receipt(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReceiptParseResponse:
    existing_types = list(
        db.scalars(
            select(ExpenseType).where(
                ExpenseType.is_archived.is_(False),
                (ExpenseType.user_id == current_user.id) | (ExpenseType.user_id.is_(None)),
            )
        ).all()
    )
    parser = get_receipt_parser()
    content_type = request.headers.get("content-type", "")

    # Case 1: JSON body with text
    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body."
            ) from exc
        text = (body.get("text") or "").strip()
        if not text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please provide receipt text to parse.",
            )
        return await run_in_threadpool(parser.parse, text, existing_types)

    # Case 2: Multipart form data with file or text
    if "multipart/form-data" in content_type:
        try:
            form = await request.form()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid form data."
            ) from exc

        file = form.get("file")
        if file and hasattr(file, "read"):
            try:
                image_bytes = await file.read()
                validate_image_bytes(image_bytes)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
                ) from exc

            scan_mode = form.get("scan_mode") or "both"
            if scan_mode not in ("ocr", "groq", "both"):
                scan_mode = "both"

            if scan_mode in ("groq", "both"):
                try:
                    ai_result = await run_in_threadpool(parser.parse_image, image_bytes, existing_types, scan_mode="groq")
                    if ai_result is not None:
                        return ai_result
                except Exception as exc:
                    if scan_mode == "groq":
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="AI receipt scanning is currently unavailable. Please try again or paste text manually.",
                        ) from exc

            ocr_provider = get_ocr_provider()
            if not ocr_provider.is_available():
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Receipt image analysis is currently unavailable on this server. "
                    "You can still paste receipt text manually or enter expenses directly.",
                )

            try:
                extracted_text = await run_in_threadpool(ocr_provider.extract_text, image_bytes)
            except OCRUnavailableError as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
                ) from exc

            return await run_in_threadpool(parser.parse, extracted_text, existing_types)

        text = form.get("text")
        if text and str(text).strip():
            return await run_in_threadpool(parser.parse, str(text).strip(), existing_types)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Please provide an image file or receipt text to parse.",
    )


@router.post(
    "/parse-text",
    response_model=ReceiptParseResponse,
    summary="Parse pasted/typed receipt text into structured expense data",
)
async def parse_receipt_text(
    payload: ReceiptTextRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReceiptParseResponse:
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide receipt text to parse.",
        )

    existing_types = list(
        db.scalars(
            select(ExpenseType).where(
                ExpenseType.is_archived.is_(False),
                (ExpenseType.user_id == current_user.id) | (ExpenseType.user_id.is_(None)),
            )
        ).all()
    )
    parser = get_receipt_parser()
    return await run_in_threadpool(parser.parse_text, text, existing_types)
