import frappe
import PyPDF2
from anthropic import Anthropic
import os
@frappe.whitelist()
def process_resume(docname):
    # fetch the document
    doc = frappe.get_doc("BTW_Candidate", docname)

    if not doc.resume_attachment:
        frappe.throw("Please upload a resume before parsing.")

    # get File doc
    file_doc = frappe.get_doc("File", {"file_url": doc.resume_attachment})

    # ---- FIXED : Build actual filesystem path ----
    file_url = file_doc.file_url                  # "/files/resume.pdf"
    file_path = frappe.get_site_path("public", file_url.lstrip("/"))

    # if not os.path.exists(file_path):
    #     frappe.throw(f"File not found at path: {file_path}")

    # ---- PDF TEXT EXTRACTION ----
    reader = PyPDF2.PdfReader(file_path)
    extracted_text = ""

    for page in reader.pages:
        try:
            extracted_text += page.extract_text() or ""
        except:
            pass

    if not extracted_text.strip():
        frappe.throw("Unable to extract text from PDF. Try another resume.")

    # 2️⃣ Initialize Claude client (your previous style)
    api_key = frappe.local.conf.get("anthropic_api_key")
    client = Anthropic(api_key=api_key)

    # 3️⃣ Prompt for clean JSON
    prompt = f"""
You are a resume parser AI. Extract ONLY JSON. No explanation.

Resume Text:
{extracted_text}

Return JSON with these fields:
- candidate_name
- email
- mobile_number
- current_location
- total_experience_years
- current_company
- current_designation
- current_ctc
- expected_ctc
- notice_period_days
- skills
- certifications
- highest_qualification
- institute
- gender
"""

    # 4️⃣ Call Claude
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )

    # json_text = response.content[0].text.strip()
    # --------------- CLEAN JSON FROM CLAUDE -----------------

    json_text = response.content[0].text.strip() if response.content else ""
    # frappe.msgprint(f"<pre>{json_text}</pre>")

    # if not json_text:
    #     frappe.throw("AI returned an empty response. Try again.")

    # remove possible markdown wrappers
    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0].strip()

    # if "{" not in json_text:
    #     frappe.throw("AI returned invalid data. No JSON detected.")

    # # Now safely parse
    # try:
    #     data = frappe.parse_json(json_text)
    #     # Fix list → string for Skill Tags
    #     if isinstance(data.get("skills_tags"), list):
    #         data["skills_tags"] = ", ".join(data["skills_tags"])

    # except Exception as e:
    #     frappe.throw(f"Unable to parse JSON: {e}")

    # # data = frappe.parse_json(json_text)
    # Parse safely
    try:
        data = frappe.parse_json(json_text)

        # Normalize list fields → comma-separated strings
        # These are JSON keys returned by Claude
        list_fields = ["skills", "certifications"]


        for field in list_fields:
            if isinstance(data.get(field), list):
                data[field] = ", ".join([str(x) for x in data[field]])

    except Exception as e:
        frappe.throw("Unable to read structured details from the resume. Please try another file.")


    # 5️⃣ Field mapping
    mapping = {
        "candidate_name": "candidate_name",
        "email": "email",
        "mobile_number": "mobile_number",
        "current_location": "current_location",
        "total_experience_years": "total_experience_years",
        "current_company": "current_company",
        "current_designation": "current_designation",
        "current_ctc": "current_ctc",
        "expected_ctc": "expected_ctc",
        "notice_period_days": "notice_period_days",
        "skills_tags": "skills",
        "key_certifications": "certifications",
        "highest_qualification": "highest_qualification",
        "institute__university": "institute",
        "gender": "gender"
    }

    # 6️⃣ Update doc fields
    for field, key in mapping.items():
        if key in data:
            doc.set(field, data[key])

    doc.save()
    frappe.db.commit()

    return {"status": "ok", "data": data}
