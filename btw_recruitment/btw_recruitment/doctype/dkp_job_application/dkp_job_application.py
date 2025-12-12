# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document



class DKP_Job_Application(Document):
	pass



# calling from client side job application js to check candidate status 
@frappe.whitelist()
def get_candidate_status(candidate):
    out = {
        "blacklisted": False,
        "cooling": False,
        "remaining_days": 0
    }

    # --------- BLACKLIST CHECK ---------
    is_blacklisted = frappe.db.get_value("DKP_Candidate", candidate, "blacklisted")

    if is_blacklisted:
        out["blacklisted"] = True
        return out

    # --------- COOLING PERIOD CHECK ---------
    last_rejected = frappe.db.sql("""
        SELECT parent.modified
        FROM `tabDKP_JobApplication_Child` child
        JOIN `tabDKP_Job_Application` parent
        ON child.parent = parent.name
        WHERE child.candidate_name = %s
        AND child.stage = 'Rejected'
        ORDER BY parent.modified DESC
        LIMIT 1
    """, (candidate,), as_dict=True)

    if last_rejected:
        from datetime import datetime, timedelta

        last_date = last_rejected[0].modified
        cooling_period = timedelta(days=180)
        remaining = (last_date + cooling_period) - datetime.now()

        if remaining.total_seconds() > 0:
            out["cooling"] = True
            out["remaining_days"] = remaining.days

    return out
