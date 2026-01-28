import frappe
from frappe.utils import now_datetime, add_days


@frappe.whitelist()
def mark_inactive_companies(days=90):
    """
    Rule:
    DKP_Company -> client_status = Inactive
    if last X days (default 90) me koi DKP_Job_Opening create nahi hui.
    """
    days = int(days)
    cutoff = add_days(now_datetime(), -days)

    # Companies with NO job openings created in last X days
    inactive_companies = frappe.db.sql("""
        SELECT c.name
        FROM `tabDKP_Company` c
        LEFT JOIN `tabDKP_Job_Opening` jo
            ON jo.company_name = c.name
            AND jo.creation >= %(cutoff)s
        WHERE c.client_type = 'Recruitment'
            AND jo.name IS NULL
    """, {"cutoff": cutoff}, as_dict=True)

    company_names = [d.name for d in inactive_companies]

    if not company_names:
        return {"updated": 0, "message": "No companies to mark inactive."}

    frappe.db.sql("""
        UPDATE `tabDKP_Company`
        SET client_status = 'Inactive'
        WHERE client_type = 'Recruitment'
        AND name IN %(names)s
    """, {"names": tuple(company_names)})

    frappe.db.commit()

    return {"updated": len(company_names)}

@frappe.whitelist()
def mark_company_active(company):
    if company:
        frappe.db.set_value("DKP_Company", company, "client_status", "Active")
        frappe.db.commit()
        return True
