import frappe

@frappe.whitelist()
def check_candidate_existing_applications(candidate, current_application=None):
    """
    Check if candidate exists in other job applications
    """
    results = frappe.db.sql("""
        SELECT
            ja.name AS job_application,
            ja.company_name,
            child.stage
        FROM `tabDKP_JobApplication_Child` child
        INNER JOIN `tabDKP_Job_Application` ja
            ON ja.name = child.parent
        WHERE
            child.candidate_name = %s
            AND ja.name != %s
            AND child.stage != 'Offer Drop'
    """, (candidate, current_application or ""), as_dict=True)

    return results
