import frappe
@frappe.whitelist()
def get_job_openings_for_candidate_dialog(
    limit=20,
    offset=0,
    search=None,
    status=None,
    priority=None,
    department=None,
):
    """
    Returns paginated job openings for the candidate "Add to Openings" dialog.
    Supports search and filters.
    """
    limit = int(limit)
    offset = int(offset)

    conditions = []
    values = []

    # Search filter (searches in name, designation, company, department)
    if search:
        search_term = f"%{search}%"
        conditions.append("""
            (name LIKE %s OR designation LIKE %s OR company_name LIKE %s OR department LIKE %s OR location LIKE)
        """)
        values.extend([search_term, search_term, search_term, search_term,search_term])

    # Status filter
    if status:
        conditions.append("status = %s")
        values.append(status)

    # Priority filter
    if priority:
        conditions.append("priority = %s")
        values.append(priority)

    # Department filter
    if department:
        conditions.append("department = %s")
        values.append(department)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    # Get total count
    total = frappe.db.sql(f"""
        SELECT COUNT(*) 
        FROM `tabDKP_Job_Opening`
        {where_clause}
    """, values)[0][0]

    # Get paginated data
    openings = frappe.db.sql(f"""
        SELECT 
            name,
            designation,
            company_name,
            department,
            status,
            priority,
            number_of_positions,
            location,
            min_experience_years,
            max_experience_years,
            min_ctc,
            max_ctc,
            creation
        FROM `tabDKP_Job_Opening`
        {where_clause}
        ORDER BY creation DESC
        LIMIT {limit} OFFSET {offset}
    """, values, as_dict=1)

    return {
        "data": openings,
        "total": total
    }