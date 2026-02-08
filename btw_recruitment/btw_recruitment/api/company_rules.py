import frappe
from frappe.utils import now_datetime, add_days


@frappe.whitelist()
def mark_inactive_companies(days=90):
    """
    Rule:
    Customer -> custom_client_status = Inactive
    if no DKP_Job_Opening created in last X days (default 90).
    """
    days = int(days)
    cutoff = add_days(now_datetime(), -days)

    # Customers with NO job openings created in last X days (Recruitment type only)
    inactive_companies = frappe.db.sql("""
        SELECT c.name
        FROM `tabCustomer` c
        LEFT JOIN `tabDKP_Job_Opening` jo
            ON jo.company_name = c.name
            AND jo.creation >= %(cutoff)s
        WHERE c.custom_client_type = 'Recruitment'
            AND jo.name IS NULL
    """, {"cutoff": cutoff}, as_dict=True)

    company_names = [d.name for d in inactive_companies]

    if not company_names:
        return {"updated": 0, "message": "No companies to mark inactive."}

    frappe.db.sql("""
        UPDATE `tabCustomer`
        SET custom_client_status = 'Inactive'
        WHERE custom_client_type = 'Recruitment'
        AND name IN %(names)s
    """, {"names": tuple(company_names)})

    frappe.db.commit()

    return {"updated": len(company_names)}

@frappe.whitelist()
def mark_company_active(company):
    """Mark Customer (company) as Active when a job opening is linked."""
    if company:
        frappe.db.set_value("Customer", company, "custom_client_status", "Active")
        frappe.db.commit()
        return True
