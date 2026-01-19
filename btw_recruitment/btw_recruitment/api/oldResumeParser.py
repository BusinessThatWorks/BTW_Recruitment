import frappe
import PyPDF2
import zipfile
import mimetypes
from anthropic import Anthropic
import os
import mammoth
import easyocr
import traceback



# Global debug log list to collect all debug messages
_debug_log = []

def debug(msg, step=None):
    """Add debug message to log and also log to Frappe error log"""
    log_entry = f"[{step}] {msg}" if step else str(msg)
    _debug_log.append(log_entry)
    frappe.log_error(message=str(msg), title=f"RESUME_DEBUG: {step}" if step else "RESUME_DEBUG")

def get_debug_log():
    """Get and clear the debug log"""
    log = _debug_log.copy()
    _debug_log.clear()
    return log

# UNIVERSAL RESUME TEXT EXTRACTOR

def extract_text_from_file(file_path, debug_log=None):
    """Extract text from file with detailed debugging"""
    if debug_log is None:
        debug_log = []
    
    mime, _ = mimetypes.guess_type(file_path)
    debug(f"Processing file: {file_path}, MIME: {mime}", "FILE_DETECTION")
    debug_log.append({"step": "FILE_DETECTION", "message": f"File path: {file_path}", "mime_type": mime})

    # 1️⃣ PDF
    if mime == "application/pdf":
        debug("Trying PDF extraction", "PDF_EXTRACTION")
        debug_log.append({"step": "PDF_EXTRACTION", "message": "Starting PDF text extraction"})
        try:
            reader = PyPDF2.PdfReader(file_path)
            num_pages = len(reader.pages)
            debug_log.append({"step": "PDF_EXTRACTION", "message": f"PDF has {num_pages} pages"})
            text = ""
            for i, p in enumerate(reader.pages):
                try:
                    page_text = p.extract_text() or ""
                    text += page_text
                    debug_log.append({"step": "PDF_EXTRACTION", "message": f"Page {i+1}: Extracted {len(page_text)} characters"})
                except Exception as e:
                    debug_log.append({"step": "PDF_EXTRACTION", "message": f"Page {i+1}: Error - {str(e)}", "error": True})
            extracted_length = len(text.strip())
            debug_log.append({"step": "PDF_EXTRACTION", "message": f"Total extracted: {extracted_length} characters", "success": True})
            return text.strip()
        except Exception as e:
            error_msg = f"PDF extraction failed: {str(e)}"
            debug(error_msg, "PDF_EXTRACTION_ERROR")
            debug_log.append({"step": "PDF_EXTRACTION", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            raise Exception(error_msg)

    # 2️⃣ DOCX
    if (mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    or file_path.lower().endswith(".docx")):
        debug("Trying DOCX extraction using Mammoth", "DOCX_EXTRACTION")
        debug_log.append({"step": "DOCX_EXTRACTION", "message": "Starting DOCX text extraction using Mammoth"})
        try:
            with open(file_path, "rb") as docx_file:
                result = mammoth.extract_raw_text(docx_file)
                text = result.value.strip()
                extracted_length = len(text)
                preview = text[:500] if text else "No text extracted"
                debug(f"MAMMOTH DOCX Extracted Text Preview: {preview}", "DOCX_EXTRACTION")
                debug_log.append({"step": "DOCX_EXTRACTION", "message": f"Extracted {extracted_length} characters", "preview": preview, "success": True})
                return text
        except Exception as e:
            error_msg = f"DOCX extraction failed: {str(e)}"
            debug(error_msg, "DOCX_EXTRACTION_ERROR")
            debug_log.append({"step": "DOCX_EXTRACTION", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            raise Exception(error_msg)


    # 3️⃣ TXT
    if mime == "text/plain":
        debug("Trying TXT extraction", "TXT_EXTRACTION")
        debug_log.append({"step": "TXT_EXTRACTION", "message": "Starting plain text file extraction"})
        try:
            text = open(file_path, "r", encoding="utf-8", errors="ignore").read().strip()
            extracted_length = len(text)
            debug_log.append({"step": "TXT_EXTRACTION", "message": f"Extracted {extracted_length} characters", "success": True})
            return text
        except Exception as e:
            error_msg = f"TXT extraction failed: {str(e)}"
            debug(error_msg, "TXT_EXTRACTION_ERROR")
            debug_log.append({"step": "TXT_EXTRACTION", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            raise Exception(error_msg)

   # 4️⃣ IMAGES (JPG/PNG → STRONG OCR)

    if mime and mime.startswith("image/"):
        debug("Trying image OCR extraction", "IMAGE_OCR")
        debug_log.append({"step": "IMAGE_OCR", "message": f"Starting OCR for image file: {mime}"})
        try:
            text = ocr_image_easy(file_path)
            extracted_length = len(text.strip())
            debug_log.append({"step": "IMAGE_OCR", "message": f"OCR extracted {extracted_length} characters", "success": True})
            return text.strip()
        except Exception as e:
            error_msg = f"Unable to extract text from image resume (OCR failed): {str(e)}"
            debug(error_msg, "IMAGE_OCR_ERROR")
            debug_log.append({"step": "IMAGE_OCR", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            raise Exception(error_msg)

    # 5️⃣ ZIP → Extract → Find first PDF/DOCX
    if mime == "application/zip" or file_path.endswith(".zip"):
        debug("Trying ZIP extraction", "ZIP_EXTRACTION")
        debug_log.append({"step": "ZIP_EXTRACTION", "message": "Starting ZIP file extraction"})
        try:
            temp_dir = file_path + "_unzipped"
            os.makedirs(temp_dir, exist_ok=True)
            debug_log.append({"step": "ZIP_EXTRACTION", "message": f"Created temp directory: {temp_dir}"})

            with zipfile.ZipFile(file_path, "r") as z:
                file_list = z.namelist()
                debug_log.append({"step": "ZIP_EXTRACTION", "message": f"ZIP contains {len(file_list)} files"})
                z.extractall(temp_dir)

            # Scan for resume inside zip
            found_files = []
            for root, _, files in os.walk(temp_dir):
                for f in files:
                    fp = os.path.join(root, f)
                    if f.lower().endswith((".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png")):
                        found_files.append(fp)
                        debug_log.append({"step": "ZIP_EXTRACTION", "message": f"Found resume file: {f}"})
                        # Recursively extract text
                        return extract_text_from_file(fp, debug_log)

            error_msg = f"No readable resume found inside ZIP file. Found {len(found_files)} files total."
            debug_log.append({"step": "ZIP_EXTRACTION", "message": error_msg, "error": True})
            raise Exception(error_msg)
        except Exception as e:
            if "No readable resume" not in str(e):
                error_msg = f"ZIP extraction failed: {str(e)}"
                debug(error_msg, "ZIP_EXTRACTION_ERROR")
                debug_log.append({"step": "ZIP_EXTRACTION", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            raise

    # Unsupported format
    error_msg = f"Unsupported file type: {mime}. Please upload PDF, DOCX, TXT, Image, or ZIP."
    debug(error_msg, "UNSUPPORTED_FORMAT")
    debug_log.append({"step": "UNSUPPORTED_FORMAT", "message": error_msg, "error": True})
    raise Exception(error_msg)



# PROCESS RESUME
@frappe.whitelist()
def process_resume(docname):
    """Process resume with comprehensive debugging"""
    debug_log = []
    
    try:
        debug_log.append({"step": "INIT", "message": f"Starting resume processing for candidate: {docname}"})
        debug(f"Starting resume processing for candidate: {docname}", "INIT")
        
        doc = frappe.get_doc("DKP_Candidate", docname)
        debug_log.append({"step": "INIT", "message": f"Loaded candidate document: {docname}"})

        if not doc.resume_attachment:
            error_msg = "Please upload a resume before parsing."
            debug_log.append({"step": "VALIDATION", "message": error_msg, "error": True})
            frappe.throw(error_msg)

        debug_log.append({"step": "FILE_LOOKUP", "message": f"Resume attachment URL: {doc.resume_attachment}"})
        file_doc = frappe.get_doc("File", {"file_url": doc.resume_attachment})
        file_url = file_doc.file_url
        debug_log.append({"step": "FILE_LOOKUP", "message": f"File document found, URL: {file_url}"})

        # Detect if file is private or public
        if file_url.startswith("/private/files/"):
            file_path = frappe.get_site_path("private", "files", os.path.basename(file_url))
            debug_log.append({"step": "FILE_PATH", "message": "File is private", "path": file_path})
        else:
            file_path = frappe.get_site_path("public", "files", os.path.basename(file_url))
            debug_log.append({"step": "FILE_PATH", "message": "File is public", "path": file_path})

        # Check if file exists
        if not os.path.exists(file_path):
            error_msg = f"File not found at path: {file_path}"
            debug_log.append({"step": "FILE_VALIDATION", "message": error_msg, "error": True})
            frappe.throw(error_msg)
        debug_log.append({"step": "FILE_VALIDATION", "message": f"File exists, size: {os.path.getsize(file_path)} bytes"})

        # UNIVERSAL TEXT EXTRACTION
        debug_log.append({"step": "TEXT_EXTRACTION", "message": "Starting text extraction from file"})
        try:
            extracted_text = extract_text_from_file(file_path, debug_log)
            extracted_length = len(extracted_text.strip())
            debug_log.append({"step": "TEXT_EXTRACTION", "message": f"Text extraction completed: {extracted_length} characters", "success": True})
        except Exception as e:
            error_msg = f"Text extraction failed: {str(e)}"
            debug_log.append({"step": "TEXT_EXTRACTION", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            frappe.throw(error_msg)

        if not extracted_text.strip():
            error_msg = "Unable to extract text from the resume. Try another file."
            debug_log.append({"step": "TEXT_VALIDATION", "message": error_msg, "error": True})
            frappe.throw(error_msg)
        
        debug_log.append({"step": "TEXT_VALIDATION", "message": f"Extracted text preview (first 200 chars): {extracted_text[:200]}", "preview": extracted_text[:500]})

        # AI Parsing
        debug_log.append({"step": "API_KEY_CHECK", "message": "Checking for Anthropic API key"})
        api_key = (
            os.getenv("ANTHROPIC_API_KEY")
            or os.getenv("anthropic_api_key")
            or frappe.conf.get("anthropic_api_key")
        )

        if not api_key:
            error_msg = "Anthropic API key missing: please set it in environment vars or site_config."
            debug_log.append({"step": "API_KEY_CHECK", "message": error_msg, "error": True})
            frappe.throw(error_msg)
        
        debug_log.append({"step": "API_KEY_CHECK", "message": "API key found", "success": True})

        debug_log.append({"step": "AI_PARSING", "message": "Initializing Anthropic client"})
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
- age(extract from date_of_birth)
"""
        debug_log.append({"step": "AI_PARSING", "message": f"Sending request to Claude API (prompt length: {len(prompt)} chars)"})
        
        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )
            debug_log.append({"step": "AI_PARSING", "message": "Received response from Claude API", "success": True})
        except Exception as e:
            error_msg = f"Claude API call failed: {str(e)}"
            debug_log.append({"step": "AI_PARSING", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            frappe.throw(error_msg)

        json_text = response.content[0].text.strip()
        debug_log.append({"step": "AI_RESPONSE", "message": f"Raw AI response length: {len(json_text)} characters", "preview": json_text[:500]})

        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0].strip()
            debug_log.append({"step": "AI_RESPONSE", "message": "Cleaned JSON from markdown code block"})

        debug_log.append({"step": "JSON_PARSING", "message": "Attempting to parse JSON response"})
        try:
            data = frappe.parse_json(json_text)
            debug_log.append({"step": "JSON_PARSING", "message": f"JSON parsed successfully. Keys found: {list(data.keys())}", "success": True})

            list_fields = ["skills", "certifications","languages_known","institute",]
            for f in list_fields:
                if isinstance(data.get(f), list):
                    data[f] = ", ".join(data[f])
                    debug_log.append({"step": "DATA_TRANSFORM", "message": f"Converted {f} from list to string"})
        except Exception as e:
            error_msg = f"Unable to read structured details from the resume. JSON parsing error: {str(e)}"
            debug_log.append({"step": "JSON_PARSING", "message": error_msg, "error": True, "raw_json": json_text, "traceback": traceback.format_exc()})
            frappe.throw(error_msg)

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
            "age": "age",
        }

        debug_log.append({"step": "FIELD_MAPPING", "message": "Starting field mapping to document"})
        mapped_fields = []
        for field, key in mapping.items():
            if key in data:
                value = data[key]
                doc.set(field, value)
                mapped_fields.append(f"{field} = {str(value)[:50]}")
                debug_log.append({"step": "FIELD_MAPPING", "message": f"Mapped {field} from {key}: {str(value)[:100]}"})
        
        debug_log.append({"step": "FIELD_MAPPING", "message": f"Mapped {len(mapped_fields)} fields", "mapped_fields": mapped_fields})
        
        doc.resume_parsed = 1
        debug_log.append({"step": "SAVE", "message": "Saving document"})
        
        try:
            doc.save()
            frappe.db.commit()
            debug_log.append({"step": "SAVE", "message": "Document saved successfully", "success": True})
        except Exception as e:
            error_msg = f"Failed to save document: {str(e)}"
            debug_log.append({"step": "SAVE", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
            frappe.throw(error_msg)
        
        debug_log.append({"step": "COMPLETE", "message": "Resume processing completed successfully", "success": True})
        return {"status": "ok", "data": data, "debug_log": debug_log}
    
    except Exception as e:
        # Catch any unexpected errors
        error_msg = f"Unexpected error in process_resume: {str(e)}"
        if 'debug_log' in locals():
            debug_log.append({"step": "ERROR", "message": error_msg, "error": True, "traceback": traceback.format_exc()})
        else:
            debug_log = [{"step": "ERROR", "message": error_msg, "error": True, "traceback": traceback.format_exc()}]
        debug(error_msg, "UNEXPECTED_ERROR")
        frappe.throw(error_msg)

def ocr_image_easy(file_path):
    try:
        debug("Initializing EasyOCR reader", "OCR_INIT")
        # Create EasyOCR reader (English language)
        reader = easyocr.Reader(['en'], gpu=False)
        debug("EasyOCR reader initialized", "OCR_INIT")

        # Read text from image
        debug(f"Reading text from image: {file_path}", "OCR_READ")
        results = reader.readtext(file_path, detail=0)
        debug(f"OCR found {len(results)} text lines", "OCR_READ")

        # Combine lines into single string
        text = "\n".join(results)
        debug(f"OCR extracted {len(text)} characters", "OCR_COMPLETE")

        return text
    except Exception as e:
        error_msg = f"EasyOCR failed: {e}"
        debug(error_msg, "OCR_ERROR")
        raise Exception(error_msg)
