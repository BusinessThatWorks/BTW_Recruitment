import json

import frappe
from frappe.utils import cint, getdate

@frappe.whitelist()
def get_recruiter_kpis(recruiter: str = None, from_date: str = None, to_date: str = None, status: str = None):
    """
    Returns KPI totals with optional filters
    If no recruiter selected, returns data for all recruiters
    """

    # Build conditions for job openings
    jo_conditions = " AND jo.status IN ('Open', 'Closed – Hired')"
    jo_params = {}

    # ✅ Only add recruiter filter if provided
    recruiter_join = ""
    if recruiter:
        recruiter_join = """
            INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
                ON r.parent = jo.name
        """
        jo_conditions += " AND r.recruiter_name = %(recruiter)s"
        jo_params["recruiter"] = recruiter

    if status:
        jo_conditions += " AND jo.status = %(status)s"
        jo_params["status"] = status

    if from_date:
        jo_conditions += " AND jo.creation >= %(from_date)s"
        jo_params["from_date"] = from_date

    if to_date:
        jo_conditions += " AND jo.creation <= %(to_date)s"
        jo_params["to_date"] = to_date

    # Get all openings
    openings = frappe.db.sql(
        f"""
        SELECT DISTINCT jo.name, jo.number_of_positions
        FROM `tabDKP_Job_Opening` jo
        {recruiter_join}
        WHERE 1=1
        {jo_conditions}
        """,
        jo_params,
        as_dict=True,
    )

    if not openings:
        return {
            "total_openings": 0,
            "total_positions": 0,
            "total_candidates": 0,
            "total_joined": 0,
            "avg_conversion": 0,
            "candidate_join_rate": 0,
        }

    opening_names = [o["name"] for o in openings]
    total_positions = sum(cint(o.get("number_of_positions")) for o in openings)

    # Build conditions for candidates
    cand_conditions = ""
    cand_params = {
        "openings": tuple(opening_names)
    }

    # ✅ Only filter by recruiter if provided
    if recruiter:
        cand_conditions += " AND jac.added_by = %(recruiter)s"
        cand_params["recruiter"] = recruiter

    if from_date:
        cand_conditions += " AND jac.creation >= %(from_date)s"
        cand_params["from_date"] = from_date

    if to_date:
        cand_conditions += " AND jac.creation <= %(to_date)s"
        cand_params["to_date"] = to_date

    # ✅ FIXED: COUNT(*) for total mappings, not DISTINCT
    stats = frappe.db.sql(
        f"""
        SELECT
            COUNT(*) AS total_candidates,
            SUM(
                CASE
                    WHEN jac.sub_stages_interview = 'Joined' THEN 1
                    ELSE 0
                END
            ) AS total_joined
        FROM `tabDKP_JobApplication_Child` jac
        WHERE jac.parent IN %(openings)s
          AND jac.parenttype = 'DKP_Job_Opening'
          AND IFNULL(jac.candidate_name, '') != ''
          {cand_conditions}
        """,
        cand_params,
        as_dict=True,
    )[0]

    total_openings = len(openings)
    total_candidates = stats.get("total_candidates") or 0
    total_joined = stats.get("total_joined") or 0

    # Calculate rates
    avg_conversion = 0
    if total_openings:
        avg_conversion = round((total_joined / total_openings) * 100, 2)

    candidate_join_rate = 0
    if total_candidates:
        candidate_join_rate = round((total_joined / total_candidates) * 100, 2)

    return {
        "total_openings": total_openings,
        "total_positions": total_positions,
        "total_candidates": total_candidates,
        "total_joined": total_joined,
        "avg_conversion": avg_conversion,
        "candidate_join_rate": candidate_join_rate,
    }


# @frappe.whitelist()
# def get_recruiter_openings(
#     recruiter: str = None, 
#     from_date: str = None, 
#     to_date: str = None, 
#     status: str = None,
#     limit: int = 20, 
#     offset: int = 0,
#     filters: str | dict | None = None,
# ):
#     """
#     Paginated job openings with optional filters
#     If no recruiter selected, returns data for all recruiters
#     """
#     limit = cint(limit)
#     offset = cint(offset)

#     # Parse inline filters (from DataTable)
#     parsed_filters: dict[str, str] = {}
#     if filters:
#         if isinstance(filters, str):
#             try:
#                 parsed_filters = json.loads(filters)
#             except Exception:
#                 parsed_filters = {}
#         elif isinstance(filters, dict):
#             parsed_filters = filters

#     # Build WHERE conditions
#     conditions = "WHERE jo.status IN ('Open', 'Closed – Hired')"
#     params = {}

#     # ✅ Only add recruiter filter if provided
#     recruiter_join = ""
#     if recruiter:
#         recruiter_join = """
#             INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
#                 ON r.parent = jo.name
#         """
#         conditions += " AND r.recruiter_name = %(recruiter)s"
#         params["recruiter"] = recruiter

#     if status:
#         conditions += " AND jo.status = %(status)s"
#         params["status"] = status

#     if from_date:
#         conditions += " AND jo.creation >= %(from_date)s"
#         params["from_date"] = from_date

#     if to_date:
#         conditions += " AND jo.creation <= %(to_date)s"
#         params["to_date"] = to_date

#     # Inline filter mapping: frontend column -> DB field
#     filter_mapping = {
#         "Job Opening": "jo.name",
#         "Company": "jo.company_name",
#         "Designation": "jo.designation",
#         "Status": "jo.status",
#         "Positions": "jo.number_of_positions",
#     }

#     for col_name, db_field in filter_mapping.items():
#         value = (parsed_filters or {}).get(col_name)
#         if value:
#             key = f"f_{db_field.replace('.', '_')}"
#             conditions += f" AND {db_field} LIKE %({key})s"
#             params[key] = f"%{value}%"

#     # Get total count
#     total = frappe.db.sql(
#         f"""
#         SELECT COUNT(DISTINCT jo.name)
#         FROM `tabDKP_Job_Opening` jo
#         {recruiter_join}
#         {conditions}
#         """,
#         params,
#     )[0][0]

#     if not total:
#         return {"data": [], "total": 0}

#     # Get openings (paginated or full for export)
#     if limit == 0:
#         openings = frappe.db.sql(
#             f"""
#             SELECT DISTINCT
#                 jo.name,
#                 jo.company_name,
#                 jo.designation,
#                 jo.status,
#                 jo.number_of_positions
#             FROM `tabDKP_Job_Opening` jo
#             {recruiter_join}
#             {conditions}
#             ORDER BY jo.creation DESC
#             """,
#             params,
#             as_dict=True,
#         )
#     else:
#         params["limit"] = limit
#         params["offset"] = offset

#         openings = frappe.db.sql(
#             f"""
#             SELECT DISTINCT
#                 jo.name,
#                 jo.company_name,
#                 jo.designation,
#                 jo.status,
#                 jo.number_of_positions
#             FROM `tabDKP_Job_Opening` jo
#             {recruiter_join}
#             {conditions}
#             ORDER BY jo.creation DESC
#             LIMIT %(limit)s OFFSET %(offset)s
#             """,
#             params,
#             as_dict=True,
#         )

#     opening_names = [o["name"] for o in openings]
#     if not opening_names:
#         return {"data": [], "total": total}

#     # Build candidate conditions
#     cand_conditions = ""
#     cand_params = {
#         "openings": tuple(opening_names)
#     }

#     # ✅ Only filter by recruiter if provided
#     if recruiter:
#         cand_conditions += " AND added_by = %(recruiter)s"
#         cand_params["recruiter"] = recruiter

#     if from_date:
#         cand_conditions += " AND creation >= %(from_date)s"
#         cand_params["from_date"] = from_date

#     if to_date:
#         cand_conditions += " AND creation <= %(to_date)s"
#         cand_params["to_date"] = to_date

#     # ✅ FIXED: COUNT(*) for total mappings
#     stats_rows = frappe.db.sql(
#         f"""
#         SELECT
#             parent AS job_opening,
#             COUNT(*) AS total_candidates,
#             SUM(
#                 CASE
#                     WHEN sub_stages_interview = 'Joined' THEN 1
#                     ELSE 0
#                 END
#             ) AS joined_candidates
#         FROM `tabDKP_JobApplication_Child`
#         WHERE parent IN %(openings)s
#           AND parenttype = 'DKP_Job_Opening'
#           AND IFNULL(candidate_name, '') != ''
#           {cand_conditions}
#         GROUP BY parent
#         """,
#         cand_params,
#         as_dict=True,
#     )

#     stats_by_opening = {row["job_opening"]: row for row in stats_rows}

#     # Build response data
#     data = []
#     for o in openings:
#         stats = stats_by_opening.get(o["name"], {}) or {}
#         data.append({
#             "job_opening": o["name"],
#             "company_name": o.get("company_name"),
#             "designation": o.get("designation"),
#             "status": o.get("status"),
#             "number_of_positions": cint(o.get("number_of_positions") or 0),
#             "total_candidates": cint(stats.get("total_candidates") or 0),
#             "joined_candidates": cint(stats.get("joined_candidates") or 0),
#         })

#     return {"data": data, "total": total}
@frappe.whitelist()
def get_recruiter_openings(
    recruiter: str = None, 
    from_date: str = None, 
    to_date: str = None, 
    status: str = None,
    limit: int = 20, 
    offset: int = 0,
    filters: str | dict | None = None,
):
    """
    Paginated job openings with optional filters
    If no recruiter selected, returns data for all recruiters
    """
    limit = cint(limit)
    offset = cint(offset)

    # Parse inline filters (from DataTable)
    parsed_filters: dict[str, str] = {}
    if filters:
        if isinstance(filters, str):
            try:
                parsed_filters = json.loads(filters)
            except Exception:
                parsed_filters = {}
        elif isinstance(filters, dict):
            parsed_filters = filters

    # Build WHERE conditions
    conditions = "WHERE jo.status IN ('Open', 'Closed – Hired')"
    params = {}

    # ✅ Only add recruiter filter if provided
    recruiter_join = ""
    if recruiter:
        recruiter_join = """
            INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
                ON r.parent = jo.name
        """
        conditions += " AND r.recruiter_name = %(recruiter)s"
        params["recruiter"] = recruiter

    if status:
        conditions += " AND jo.status = %(status)s"
        params["status"] = status

    if from_date:
        conditions += " AND jo.creation >= %(from_date)s"
        params["from_date"] = from_date

    if to_date:
        conditions += " AND jo.creation <= %(to_date)s"
        params["to_date"] = to_date

    # Inline filter mapping: frontend column -> DB field
    filter_mapping = {
        "Job Opening": "jo.name",
        "Company": "jo.company_name",
        "Designation": "jo.designation",
        "Status": "jo.status",
        "Positions": "jo.number_of_positions",
    }

    for col_name, db_field in filter_mapping.items():
        value = (parsed_filters or {}).get(col_name)
        if value:
            key = f"f_{db_field.replace('.', '_')}"
            conditions += f" AND {db_field} LIKE %({key})s"
            params[key] = f"%{value}%"

    # Get total count
    total = frappe.db.sql(
        f"""
        SELECT COUNT(DISTINCT jo.name)
        FROM `tabDKP_Job_Opening` jo
        {recruiter_join}
        {conditions}
        """,
        params,
    )[0][0]

    if not total:
        return {"data": [], "total": 0}

    # Get openings (paginated or full for export)
    if limit == 0:
        openings = frappe.db.sql(
            f"""
            SELECT DISTINCT
                jo.name,
                jo.company_name,
                jo.designation,
                jo.status,
                jo.number_of_positions
            FROM `tabDKP_Job_Opening` jo
            {recruiter_join}
            {conditions}
            ORDER BY jo.creation DESC
            """,
            params,
            as_dict=True,
        )
    else:
        params["limit"] = limit
        params["offset"] = offset

        openings = frappe.db.sql(
            f"""
            SELECT DISTINCT
                jo.name,
                jo.company_name,
                jo.designation,
                jo.status,
                jo.number_of_positions
            FROM `tabDKP_Job_Opening` jo
            {recruiter_join}
            {conditions}
            ORDER BY jo.creation DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            params,
            as_dict=True,
        )

    opening_names = [o["name"] for o in openings]
    if not opening_names:
        return {"data": [], "total": total}

    # Build candidate conditions
    cand_conditions = ""
    cand_params = {
        "openings": tuple(opening_names)
    }

    # ✅ Only filter by recruiter if provided
    if recruiter:
        cand_conditions += " AND added_by = %(recruiter)s"
        cand_params["recruiter"] = recruiter

    if from_date:
        cand_conditions += " AND creation >= %(from_date)s"
        cand_params["from_date"] = from_date

    if to_date:
        cand_conditions += " AND creation <= %(to_date)s"
        cand_params["to_date"] = to_date

    # ✅ FIXED: COUNT(*) for total mappings
    stats_rows = frappe.db.sql(
        f"""
        SELECT
            parent AS job_opening,
            COUNT(*) AS total_candidates,
            SUM(
                CASE
                    WHEN sub_stages_interview = 'Joined' THEN 1
                    ELSE 0
                END
            ) AS joined_candidates
        FROM `tabDKP_JobApplication_Child`
        WHERE parent IN %(openings)s
          AND parenttype = 'DKP_Job_Opening'
          AND IFNULL(candidate_name, '') != ''
          {cand_conditions}
        GROUP BY parent
        """,
        cand_params,
        as_dict=True,
    )

    stats_by_opening = {row["job_opening"]: row for row in stats_rows}

    # ✅ NEW: Get joined candidates list with names and links
    joined_candidates_rows = frappe.db.sql(
        f"""
        SELECT
            jac.parent AS job_opening,
            jac.name AS child_name,
            jac.candidate_name,
            c.candidate_name as full_name
        FROM `tabDKP_JobApplication_Child` jac
        LEFT JOIN `tabDKP_Candidate` c ON c.name = jac.candidate_name
        WHERE jac.parent IN %(openings)s
          AND jac.parenttype = 'DKP_Job_Opening'
          AND jac.sub_stages_interview = 'Joined'
          AND IFNULL(jac.candidate_name, '') != ''
          {cand_conditions}
        ORDER BY c.candidate_name
        """,
        cand_params,
        as_dict=True,
    )

    # ✅ Group joined candidates by job opening
    joined_by_opening = {}
    for row in joined_candidates_rows:
        job_opening = row["job_opening"]
        if job_opening not in joined_by_opening:
            joined_by_opening[job_opening] = []
        
        joined_by_opening[job_opening].append({
            "name": row.get("candidate_name"),  # DKP_Candidate ID for link
            "candidate_name": row.get("full_name") or row.get("candidate_name") or "Unknown",
        })

    # Build response data
    data = []
    for o in openings:
        stats = stats_by_opening.get(o["name"], {}) or {}
        data.append({
            "job_opening": o["name"],
            "company_name": o.get("company_name"),
            "designation": o.get("designation"),
            "status": o.get("status"),
            "number_of_positions": cint(o.get("number_of_positions") or 0),
            "total_candidates": cint(stats.get("total_candidates") or 0),
            "joined_candidates": cint(stats.get("joined_candidates") or 0),
            "joined_candidate_list": joined_by_opening.get(o["name"], []),  # ✅ NEW
        })

    return {"data": data, "total": total}


@frappe.whitelist()
def get_recruiters():
    """
    Return active recruiters
    """
    return frappe.db.sql(
        """
        SELECT name, full_name
        FROM `tabUser`
        WHERE enabled = 1
          AND role_profile_name IN ('DKP Recruiter', 'DKP Recruiter - Exclusive', 'Admin')
        ORDER BY full_name
        """,
        as_dict=True,
    )


@frappe.whitelist()
def get_funnel_data(recruiter: str = None, from_date: str = None, to_date: str = None, status: str = None):
    """
    Get recruitment funnel data - separated into mapping stages and interview stages
    If no recruiter selected, returns data for all recruiters
    """

    # Build conditions for job openings
    jo_conditions = " AND jo.status IN ('Open', 'Closed – Hired')"
    jo_params = {}

    # ✅ Only add recruiter filter if provided
    recruiter_join = ""
    if recruiter:
        recruiter_join = """
            INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
                ON r.parent = jo.name
        """
        jo_conditions += " AND r.recruiter_name = %(recruiter)s"
        jo_params["recruiter"] = recruiter

    if status:
        jo_conditions += " AND jo.status = %(status)s"
        jo_params["status"] = status

    if from_date:
        jo_conditions += " AND jo.creation >= %(from_date)s"
        jo_params["from_date"] = from_date

    if to_date:
        jo_conditions += " AND jo.creation <= %(to_date)s"
        jo_params["to_date"] = to_date

    # Get all openings
    openings = frappe.db.sql(
        f"""
        SELECT DISTINCT jo.name
        FROM `tabDKP_Job_Opening` jo
        {recruiter_join}
        WHERE 1=1
        {jo_conditions}
        """,
        jo_params,
        as_dict=True,
    )

    if not openings:
        return {
            "mapping_stages": {},
            "interview_stages": {}
        }

    opening_names = [o["name"] for o in openings]

    # Build conditions for candidates
    cand_conditions = ""
    cand_params = {
        "openings": tuple(opening_names)
    }

    # ✅ Only filter by recruiter if provided
    if recruiter:
        cand_conditions += " AND jac.added_by = %(recruiter)s"
        cand_params["recruiter"] = recruiter

    if from_date:
        cand_conditions += " AND jac.creation >= %(from_date)s"
        cand_params["from_date"] = from_date

    if to_date:
        cand_conditions += " AND jac.creation <= %(to_date)s"
        cand_params["to_date"] = to_date

    # ✅ FIXED: COUNT(*) for total mappings
    total_mapped = frappe.db.sql(
        f"""
        SELECT COUNT(*) as count
        FROM `tabDKP_JobApplication_Child` jac
        WHERE jac.parent IN %(openings)s
          AND jac.parenttype = 'DKP_Job_Opening'
          AND IFNULL(jac.candidate_name, '') != ''
          {cand_conditions}
        """,
        cand_params,
        as_dict=True,
    )[0]["count"] or 0

    # Get counts by MAPPING stages (stage field)
    mapping_result = frappe.db.sql(
        f"""
        SELECT 
            jac.stage,
            COUNT(*) as count
        FROM `tabDKP_JobApplication_Child` jac
        WHERE jac.parent IN %(openings)s
          AND jac.parenttype = 'DKP_Job_Opening'
          AND IFNULL(jac.candidate_name, '') != ''
          AND jac.stage IS NOT NULL
          {cand_conditions}
        GROUP BY jac.stage
        """,
        cand_params,
        as_dict=True,
    )

    # Get counts by INTERVIEW stages (sub_stages_interview field)
    interview_result = frappe.db.sql(
        f"""
        SELECT 
            jac.sub_stages_interview,
            COUNT(*) as count
        FROM `tabDKP_JobApplication_Child` jac
        WHERE jac.parent IN %(openings)s
          AND jac.parenttype = 'DKP_Job_Opening'
          AND IFNULL(jac.candidate_name, '') != ''
          AND jac.sub_stages_interview IS NOT NULL
          {cand_conditions}
        GROUP BY jac.sub_stages_interview
        """,
        cand_params,
        as_dict=True,
    )

    # Create maps
    mapping_map = {r["stage"]: r["count"] for r in mapping_result}
    interview_map = {r["sub_stages_interview"]: r["count"] for r in interview_result}

    # ===== MAPPING STAGES =====
    mapping_stages = {
        "total_mapped": total_mapped,
        "no_response": mapping_map.get("No Response", 0),
        "submitted_to_client": mapping_map.get("Submitted To Client", 0),
        "client_rejected": mapping_map.get("Client Screening Rejected", 0),
        "schedule_interview": mapping_map.get("Schedule Interview", 0)
    }

    # ===== INTERVIEW STAGES =====
    interview_stages = {
        "interview_no_show": interview_map.get("Interview No Show", 0),
        "selected_for_offer": interview_map.get("Selected For Offer", 0),
        "rejected_by_client": interview_map.get("Rejected By Client", 0),
        "offered": interview_map.get("Offered", 0),
        "offer_accepted": interview_map.get("Offer Accepted", 0),
        "offer_declined": interview_map.get("Offer Declined", 0),
        "joined": interview_map.get("Joined", 0),
        "joined_and_left": interview_map.get("Joined And Left", 0)
    }

    # ✅ Calculate total in interview stages
    interview_total = sum(interview_stages.values())
    interview_stages["total_interview"] = interview_total

    return {
        "mapping_stages": mapping_stages,
        "interview_stages": interview_stages
    }