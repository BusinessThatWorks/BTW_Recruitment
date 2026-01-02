# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document



class DKP_Job_Application(Document):
	pass

import frappe
from datetime import datetime, timedelta

@frappe.whitelist()
def get_candidate_status(candidate):
    out = {
        "blacklisted": False,
        "cooling": False,
        "remaining_days": 0,
        "no_poach": False,
        "no_poach_company": ""
    }

    # ---------------- BLACKLIST CHECK ----------------
    is_blacklisted = frappe.db.get_value(
        "DKP_Candidate", candidate, "blacklisted"
    )

    if is_blacklisted:
        out["blacklisted"] = True
        return out   # HARD STOP

    # ---------------- COOLING PERIOD CHECK ----------------
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
        last_date = last_rejected[0].modified
        cooling_period = timedelta(days=180)
        remaining = (last_date + cooling_period) - datetime.now()

        if remaining.total_seconds() > 0:
            out["cooling"] = True
            out["remaining_days"] = remaining.days
            return out   # HARD STOP

    # ---------------- NO POACH CHECK ----------------
    current_company = frappe.db.get_value(
        "DKP_Candidate", candidate, "current_company_master"
    )

    if current_company:
        no_poach = frappe.db.get_value(
            "DKP_Company", current_company, "no_poach_flag"
        )

        if no_poach:
            out["no_poach"] = True
            out["no_poach_company"] = current_company
            return out   # HARD STOP

    return out

@frappe.whitelist()
def get_open_job_openings(company_name=None):
    """
    API endpoint to get job openings filtered by company and status
    Called from JavaScript when company is selected
    """
    filters = {'status': 'Open'}
    
    if company_name:
        filters['company'] = company_name
    
    open_jobs = frappe.get_list(
        'DKP_Job_Opening',
        filters=filters,
        fields=['name', 'designation', 'company', 'status'],
        order_by='name asc'
    )
    
    # Format response for Select field
    job_options = [{'value': job.name, 'label': f"{job.designation} - {job.company}"} for job in open_jobs]
    
    return {
        'success': True,
        'data': job_options,
        'count': len(job_options)
    }