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

# UNIVERSAL RESUME TEXT EXTRACTOR

def extract_text_from_file(file_path):
    mime, _ = mimetypes.guess_type(file_path)
    debug(f"Processing file: {file_path}, MIME: {mime}")

    # Guess mime type
    mime, _ = mimetypes.guess_type(file_path)

    # 1️⃣ PDF
    if mime == "application/pdf":
        debug("Trying PDF extraction")
        reader = PyPDF2.PdfReader(file_path)
        text = ""
        for p in reader.pages:
            try:
                text += p.extract_text() or ""
            except:
                pass
        return text.strip()

    # 2️⃣ DOCX
    if (mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    or file_path.lower().endswith(".docx")):
    
        debug("Trying DOCX extraction using Mammoth")

    try:
        with open(file_path, "rb") as docx_file:
            result = mammoth.extract_raw_text(docx_file)
            text = result.value.strip()

        debug(f"MAMMOTH DOCX Extracted Text Preview: {text[:500]}")
        return text

    except Exception as e:
        debug(f"DOCX ERROR: {e}")
        # raise


    # 3️⃣ TXT
    if mime == "text/plain":
        return open(file_path, "r", encoding="utf-8", errors="ignore").read().strip()

   # 4️⃣ IMAGES (JPG/PNG → STRONG OCR)

    if mime and mime.startswith("image/"):
        try:
            text = ocr_image_easy(file_path)
            return text.strip()
        except Exception as e:
            raise Exception("Unable to extract text from image resume (OCR failed).")

    # 5️⃣ ZIP → Extract → Find first PDF/DOCX
    if mime == "application/zip" or file_path.endswith(".zip"):
        temp_dir = file_path + "_unzipped"
        os.makedirs(temp_dir, exist_ok=True)

        with zipfile.ZipFile(file_path, "r") as z:
            z.extractall(temp_dir)

        # Scan for resume inside zip
        for root, _, files in os.walk(temp_dir):
            for f in files:
                fp = os.path.join(root, f)
                if f.lower().endswith((".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png")):
                    # Recursively extract text
                    return extract_text_from_file(fp)

        raise Exception("No readable resume found inside ZIP file.")

    # Unsupported format
    raise Exception("Unsupported file type. Please upload PDF, DOCX, TXT, Image, or ZIP.")



# PROCESS RESUME
@frappe.whitelist()
def process_resume(docname):

    doc = frappe.get_doc("DKP_Candidate", docname)

    if not doc.resume_attachment:
        frappe.throw("Please upload a resume before parsing.")

    file_doc = frappe.get_doc("File", {"file_url": doc.resume_attachment})

    file_url = file_doc.file_url
    # file_path = frappe.get_site_path(file_url.lstrip("/"))

    # Detect if file is private or public
    if file_url.startswith("/private/files/"):
        file_path = frappe.get_site_path("private", "files", os.path.basename(file_url))
    else:
        file_path = frappe.get_site_path("public", "files", os.path.basename(file_url))


    # UNIVERSAL TEXT EXTRACTION
    try:
        extracted_text = extract_text_from_file(file_path)
    except Exception as e:
        frappe.throw(str(e))

    if not extracted_text.strip():
        frappe.throw("Unable to extract text from the resume. Try another file.")

    # AI Parsing (your original part continues)
    api_key = (
    os.getenv("ANTHROPIC_API_KEY")
    or os.getenv("anthropic_api_key")
    or frappe.conf.get("anthropic_api_key")
)

    if not api_key:
     frappe.throw("Anthropic API key missing: please set it in environment vars or site_config.")

    client = Anthropic(api_key=api_key)

    prompt = f"""
You are a resume parser AI. Extract ONLY JSON. No explanation.

Resume Text:
{extracted_text}

Return JSON with these fields:
- candidate_name
- email
- mobile_number
- alternate_mobile_number
- current_location
- total_experience_years
- current_company
- current_designation
- skills
- certifications
- highest_qualification
- institute
- languages_known
- date_of_birth (format: YYYY-MM-DD)
- address
"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )

    json_text = response.content[0].text.strip()

    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0].strip()

    try:
        data = frappe.parse_json(json_text)

        list_fields = ["skills", "certifications","languages_known","institute",]
        for f in list_fields:
            if isinstance(data.get(f), list):
                data[f] = ", ".join(data[f])
                # comment
    except:
        frappe.throw("Unable to read structured details from the resume.")

    mapping = {
        "candidate_name": "candidate_name",
        "email": "email",
        "mobile_number": "mobile_number",
        "alternate_phone": "alternate_mobile_number",
        "current_location": "current_location",
        "total_experience_years": "total_experience_years",
        "current_company": "current_company",
        "current_designation": "current_designation",
        "skills_tags": "skills",
        "key_certifications": "certifications",
        "highest_qualification": "highest_qualification",
        "institute__university": "institute",
        "languages": "languages_known",
        "date_of_birth": "date_of_birth",
        "address": "address",
    }

    for field, key in mapping.items():
        if key in data:
            doc.set(field, data[key])
    doc.resume_parsed = 1

    doc.save()
    frappe.db.commit()
    return {"status": "ok", "data": data}

def ocr_image_easy(file_path):
    try:
        # Create EasyOCR reader (English language)
        reader = easyocr.Reader(['en'], gpu=False)

        # Read text from image
        results = reader.readtext(file_path, detail=0)

        # Combine lines into single string
        text = "\n".join(results)

        return text
    except Exception as e:
        raise Exception(f"EasyOCR failed: {e}")
