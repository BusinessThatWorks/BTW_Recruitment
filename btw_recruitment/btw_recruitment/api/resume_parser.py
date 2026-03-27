import frappe
import PyPDF2
import zipfile
import mimetypes
from anthropic import Anthropic
import os
import mammoth
import easyocr


def debug(msg):
    frappe.log_error(message=str(msg), title="RESUME_DEBUG")


# ── OCR HELPERS ──────────────────────────────────────────────────────────────

def ocr_image_easy(file_path):
    """OCR for image files using EasyOCR."""
    try:
        reader = easyocr.Reader(['en'], gpu=False)
        results = reader.readtext(file_path, detail=0)
        return "\n".join(results)
    except Exception as e:
        raise Exception(f"EasyOCR failed: {e}")


def ocr_pdf_pages(file_path):
    """
    Convert each PDF page to an image, then OCR it.
    Requires: pdf2image + poppler installed on server.
    pip install pdf2image
    apt-get install poppler-utils
    """
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(file_path, dpi=200)
        reader = easyocr.Reader(['en'], gpu=False)
        full_text = ""
        for i, img in enumerate(images):
            # Save temp image
            tmp_path = f"/tmp/resume_page_{i}.jpg"
            img.save(tmp_path, "JPEG")
            results = reader.readtext(tmp_path, detail=0)
            full_text += "\n".join(results) + "\n"
            os.remove(tmp_path)
        debug(f"PDF OCR extracted {len(full_text)} chars")
        return full_text.strip()
    except Exception as e:
        raise Exception(f"PDF OCR fallback failed: {e}")


# ── UNIVERSAL TEXT EXTRACTOR ──────────────────────────────────────────────────

def extract_text_from_file(file_path):
    mime, _ = mimetypes.guess_type(file_path)
    debug(f"Processing file: {file_path}, MIME: {mime}")

    # 1️⃣ PDF — try PyPDF2 first, OCR fallback
    if mime == "application/pdf":
        debug("Trying PDF extraction via PyPDF2")
        reader = PyPDF2.PdfReader(file_path)
        text = ""
        for p in reader.pages:
            try:
                text += p.extract_text() or ""
            except Exception:
                pass

        if text.strip():
            debug(f"PyPDF2 extracted {len(text)} chars")
            return text.strip()

        # Image-based or designed PDF — fall back to OCR
        debug("PyPDF2 returned empty — switching to OCR")
        return ocr_pdf_pages(file_path)

    # 2️⃣ DOCX
    if (
        mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or file_path.lower().endswith(".docx")
    ):
        debug("Trying DOCX extraction via Mammoth")
        try:
            with open(file_path, "rb") as docx_file:
                result = mammoth.extract_raw_text(docx_file)
                text = result.value.strip()
            debug(f"Mammoth extracted {len(text)} chars")
            return text
        except Exception as e:
            raise Exception(f"DOCX extraction failed: {e}")

    # 3️⃣ TXT
    if mime == "text/plain":
        return open(file_path, "r", encoding="utf-8", errors="ignore").read().strip()

    # 4️⃣ Images
    if mime and mime.startswith("image/"):
        try:
            return ocr_image_easy(file_path).strip()
        except Exception as e:
            raise Exception(f"Image OCR failed: {e}")

    # 5️⃣ ZIP
    if mime == "application/zip" or file_path.endswith(".zip"):
        temp_dir = file_path + "_unzipped"
        os.makedirs(temp_dir, exist_ok=True)
        with zipfile.ZipFile(file_path, "r") as z:
            z.extractall(temp_dir)
        for root, _, files in os.walk(temp_dir):
            for f in files:
                fp = os.path.join(root, f)
                if f.lower().endswith((".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png")):
                    return extract_text_from_file(fp)
        raise Exception("No readable resume found inside ZIP.")

    raise Exception(
        f"Unsupported file type '{mime}'. Upload PDF, DOCX, TXT, Image, or ZIP."
    )


# ── INVALID DATE GUARD (defined once, outside loops) ─────────────────────────

def is_invalid_date(value):
    if not isinstance(value, str):
        return False
    v = value.strip().lower().replace("_", " ").replace("/", "")
    return v in ["not provided", "n a", "na", "none", "null", ""]


# ── MAIN WHITELISTED FUNCTION ─────────────────────────────────────────────────

@frappe.whitelist()
def process_resume(docname):

    doc = frappe.get_doc("DKP_Candidate", docname)

    if not doc.resume_attachment:
        frappe.throw("Please upload a resume before parsing.")

    file_doc = frappe.get_doc("File", {"file_url": doc.resume_attachment})
    file_url = file_doc.file_url

    if file_url.startswith("/private/files/"):
        file_path = frappe.get_site_path("private", "files", os.path.basename(file_url))
    else:
        file_path = frappe.get_site_path("public", "files", os.path.basename(file_url))

    # ── EXTRACT TEXT ──────────────────────────────────────────────────────────
    try:
        extracted_text = extract_text_from_file(file_path)
    except Exception as e:
        frappe.throw(f"Text extraction failed: {str(e)}")

    if not extracted_text.strip():
        frappe.throw(
            "Could not extract any text from the resume. "
            "Ensure the file is not corrupted or password-protected."
        )

    debug(f"Extracted text preview: {extracted_text[:300]}")

    # ── ANTHROPIC SETUP ───────────────────────────────────────────────────────
    api_key = (
        os.getenv("ANTHROPIC_API_KEY")
        or os.getenv("anthropic_api_key")
        or frappe.conf.get("anthropic_api_key")
    )
    if not api_key:
        frappe.throw("Anthropic API key missing. Set it in environment vars or site_config.")

    client = Anthropic(api_key=api_key)

    # ── PROMPT ────────────────────────────────────────────────────────────────
    prompt = f"""
You are a senior HR analytics resume parser.

YOUR TASK:
1. Extract ALL work experiences with exact dates.
2. Identify gaps BETWEEN experiences automatically.
3. Calculate TOTAL PROFESSIONAL EXPERIENCE excluding gap periods.
4. Perform all date calculations carefully.

RULES:
- Do NOT guess employment not written in the resume.
- If two jobs have a break between them, count that break as a GAP.
- If "Present" is mentioned, treat it as the current month.
- Use month-level precision.
- If a date value is NOT explicitly mentioned, return null.
- Do NOT return "N/A", "Not provided", "Unknown", empty string, or placeholders.
- All date fields MUST be either a valid date in YYYY-MM-DD format OR null.

DATE HANDLING:
- Month name → number (Jan=01 … Dec=12)
- If only year is given: assume January for start, December for end
- Example: "May 2022 – Oct 2023" → 1.42 years

Resume Text:
----------------
{extracted_text}
----------------

Return ONLY valid raw JSON (no markdown, no explanation, no comments):
{{
  "candidate_name": "",
  "email": "",
  "mobile_number": "",
  "alternate_mobile_number": null,
  "current_location": "",
  "total_experience_years": 0.0,
  "current_company": "",
  "current_designation": "",
  "skills": [],
  "certifications": [],
  "highest_qualification": "",
  "institute": "",
  "languages_known": [],
  "date_of_birth": null,
  "address": "",
  "age": null
}}
"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )

    json_text = response.content[0].text.strip()

    # Strip markdown fences if present
    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0].strip()
    elif "```" in json_text:
        json_text = json_text.split("```")[1].split("```")[0].strip()

    # ── PARSE & VALIDATE ──────────────────────────────────────────────────────
    try:
        data = frappe.parse_json(json_text)
    except Exception:
        debug(f"Bad JSON from Claude: {json_text}")
        frappe.throw("Claude returned invalid JSON. Check debug logs.")

    EXPECTED_FIELDS = [
        "candidate_name", "email", "mobile_number", "current_location",
        "total_experience_years", "current_company", "current_designation",
        "skills", "highest_qualification", "institute", "languages_known",
    ]

    extracted_fields = [f for f in EXPECTED_FIELDS if data.get(f) not in [None, "", []]]
    missing_fields   = [f for f in EXPECTED_FIELDS if f not in extracted_fields]

    confidence_score = round(len(extracted_fields) / len(EXPECTED_FIELDS) * 100)
    debug(f"Confidence: {confidence_score}% | Missing: {missing_fields}")

    if confidence_score < 50:
        frappe.throw(
            f"Resume parsing confidence too low ({confidence_score}%). "
            "Upload a clearer or more complete resume."
        )

    # ── FLATTEN LISTS ─────────────────────────────────────────────────────────
    for f in ["skills", "certifications", "languages_known", "institute"]:
        if isinstance(data.get(f), list):
            data[f] = ", ".join(str(x) for x in data[f])

    # ── MAP TO DOC ────────────────────────────────────────────────────────────
    mapping = {
        "candidate_name":       "candidate_name",
        "email":                "email",
        "mobile_number":        "mobile_number",
        "alternate_phone":      "alternate_mobile_number",
        "current_location":     "current_location",
        "total_experience_years": "total_experience_years",
        "current_company":      "current_company",
        "current_designation":  "current_designation",
        "skills_tags":          "skills",
        "key_certifications":   "certifications",
        "highest_qualification":"highest_qualification",
        "institute__university":"institute",
        "languages":            "languages_known",
        "date_of_birth":        "date_of_birth",
        "address":              "address",
        "age":                  "age",
    }

    for doc_field, data_key in mapping.items():
        value = data.get(data_key)

        if doc_field == "date_of_birth" and is_invalid_date(value):
            continue

        if value is None:
            continue

        doc.set(doc_field, value)

    doc.set("confidence_score", confidence_score)
    doc.resume_parsed = 1
    doc.save()
    frappe.db.commit()

    return {
        "status": "ok",
        "confidence_score": confidence_score,
        "missing_fields": missing_fields,
        "data": data,
    }