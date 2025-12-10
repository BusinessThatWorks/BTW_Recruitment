import frappe

@frappe.whitelist()
def rename_candidate_after_parse(docname, force="0"):
    """
    Rename candidate only using candidate_name.
    - No designation included.
    """
    doc = frappe.get_doc("DKP_Candidate", docname)

    # Safe inline handling
    name = doc.candidate_name.strip() if doc.candidate_name else ""

    # If missing name and not forced → skip
    if not name:
        if force == "1":
            name = "candidate"
        else:
            return {"renamed": False, "reason": "missing_name", "new_name": doc.name}

    base = name  # <-- NO DESIGNATION EVER

    # Already same name
    if doc.name == base:
        return {"renamed": False, "reason": "already_named", "new_name": doc.name}

    # Check if available
    if not frappe.db.exists("DKP_Candidate", base):
        new_name = base
    else:
        # Add counter for duplicates
        counter = 1
        new_name = f"{base}-{counter:04d}"
        while frappe.db.exists("DKP_Candidate", new_name):
            counter += 1
            new_name = f"{base}-{counter:04d}"

    # Rename safely
    try:
        frappe.rename_doc("DKP_Candidate", doc.name, new_name, force=True)
        frappe.db.commit()
        return {"renamed": True, "new_name": new_name}
    except Exception as e:
        frappe.log_error(message=str(e), title="rename_candidate_after_parse_error")
        return {
            "renamed": False,
            "reason": "rename_failed",
            "error": str(e),
            "new_name": doc.name
        }
