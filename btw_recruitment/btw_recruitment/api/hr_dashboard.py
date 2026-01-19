import frappe

@frappe.whitelist()
def get_candidates_by_department(from_date=None, to_date=None):
    filters = {}
    
    # Optional: filter by date if provided
    if from_date and to_date:
        filters["creation"] = ["between", [from_date, to_date]]
    
    # Fetch candidate counts grouped by department
    data = frappe.db.sql("""
        SELECT department, COUNT(name) as count
        FROM `tabDKP_Candidate`
        WHERE department IS NOT NULL
        GROUP BY department
    """, as_dict=1)

    return data

@frappe.whitelist()
def get_urgent_openings(from_date=None, to_date=None):

    filters = [
        ["priority", "in", ["High", "Critical"]]
    ]

    # 🔹 DATE FILTER
    if from_date and to_date:
        filters.append([
            "creation",
            "between",
            [from_date, add_days(to_date, 1)]
        ])

    return frappe.get_all(
        "DKP_Job_Opening",
        fields=[
            "name",
            "designation",
            "company_name",
            # "assign_recruiter",
            "priority",
            "number_of_positions",
            "status"
        ],
        filters=filters,
        order_by="modified desc"
    )


@frappe.whitelist()
def get_recruiter_filter_options():
    return frappe.db.sql("""
        SELECT
            name,
            full_name
        FROM `tabUser`
        WHERE
            enabled = 1
            AND role_profile_name = 'DKP Recruiter'
        ORDER BY full_name
    """, as_dict=True)

# import frappe
# from frappe.utils import now_datetime, add_days
# from frappe.utils import format_datetime

# @frappe.whitelist()
# def get_job_health(from_date=None, to_date=None, limit=10, offset=0,department=None,
# priority=None,
# sla_status=None):
#     limit = int(limit)
#     offset = int(offset)

#     job_filters = []

#     # ---------------- DATE FILTER ----------------
#     if from_date and to_date:
#         job_filters.append([
#             "creation",
#             "between",
#             [from_date, add_days(to_date, 1)]
#         ])
#     # Department
#     if department:
#         job_filters.append(["department", "=", department])

#     # Priority
#     if priority:
#         job_filters.append(["priority", "=", priority])

#     # SLA Status
#     if sla_status:
#         if sla_status == "Open":
#             job_filters.append(["status", "=", "Open"])
#         elif sla_status == "On Hold":
#             job_filters.append(["status", "=", "On Hold"])
#         elif sla_status == "Closed – Hired":
#             job_filters.append(["status", "=", "Closed – Hired"])
#         elif sla_status == "Closed – Cancelled":
#             job_filters.append(["status", "=", "Closed – Cancelled"])

#     # ---------------- FETCH JOBS ----------------
#     jobs = frappe.get_all(
#         "DKP_Job_Opening",
#         fields=[
#             "name",
#             "designation",
#             "company",
#             "department",
#             "number_of_positions",
#             "status",
#             "priority",
#                     "creation"   # 👈 REQUIRED for ageing

#         ],
#         filters=job_filters,
#         limit_start=offset,
#         limit_page_length=limit
#     )

#     # Total count (for pagination)
#     total = frappe.db.count(
#         "DKP_Job_Opening",
#         filters=job_filters
#     )

#     now = now_datetime()
#     result = []

#     for job in jobs:
#         # ---------------- CANDIDATE COUNT ----------------
#         job_applications = frappe.get_all(
#             "DKP_Job_Application",
#             filters={"job_opening_title": job.name},
#             pluck="name"
#         )

#         candidate_count = 0
#         if job_applications:
#             candidate_count = frappe.db.count(
#                 "DKP_JobApplication_Child",
#                 {
#                     "parent": ["in", job_applications],
#                     "parenttype": "DKP_Job_Application",
#                     "stage": ["in", ["In Review", "Screening", "Interview", "Offered","","Rejected","Offer Drop"]]
#                 }
#             )

#         positions = int(job.number_of_positions or 0)

#         result.append({
#             "job_opening": job.name,
#             "designation":job.designation,
#             "department": job.department,
#             "positions": positions,
#             "candidates": candidate_count,
#             "status": job.status,
#             "priority": job.priority,
#         })

#     return {"total": total, "data": result}

import frappe
from frappe.utils import now_datetime, add_days

@frappe.whitelist()
def get_job_health(
    from_date=None,
    to_date=None,
    limit=10,
    offset=0,
    department=None,
    priority=None,
    sla_status=None
):
    limit = int(limit)
    offset = int(offset)

    job_filters = []

    # ---------------- DATE FILTER ----------------
    if from_date and to_date:
        job_filters.append([
            "creation",
            "between",
            [from_date, add_days(to_date, 1)]
        ])

    # Department
    if department:
        job_filters.append(["department", "=", department])

    # Priority
    if priority:
        job_filters.append(["priority", "=", priority])

    # Status (SLA Status)
    if sla_status:
        job_filters.append(["status", "=", sla_status])

    # ---------------- FETCH JOBS ----------------
    jobs = frappe.get_all(
        "DKP_Job_Opening",
        fields=[
            "name",
            "designation",
            "company",
            "department",
            "number_of_positions",
            "status",
            "priority",
            "creation"   # required for ageing
        ],
        filters=job_filters,
        limit_start=offset,
        limit_page_length=limit
    )

    # Total count (pagination)
    total = frappe.db.count("DKP_Job_Opening", filters=job_filters)

    now = now_datetime()
    result = []

    for job in jobs:
        # ---------------- AGEING ----------------
        ageing_days = (now - job.creation).days if job.creation else 0

        # ---------------- CANDIDATE COUNT ----------------
        candidate_count = frappe.db.count(
            "DKP_JobApplication_Child",
            filters={
                "parent": job.name,
                "parenttype": "DKP_Job_Opening",
                "stage": ["in", [
                    "In Review",
                    "Screening",
                    "Interview",
                    "Offered",
                    "",
                    "Rejected",
                    "Offer Drop"
                ]]
            }
        )

        positions = int(job.number_of_positions or 0)

        result.append({
            "job_opening": job.name,
            "designation": job.designation,
            "department": job.department,
            "positions": positions,
            "candidates": candidate_count,
            "status": job.status,
            "priority": job.priority,
            "ageing_days": ageing_days
        })

    return {
        "total": total,
        "data": result
    }


import frappe
from frappe.utils import get_datetime, add_days

@frappe.whitelist()
def get_department_job_data(from_date=None, to_date=None):
    filters = []

    if from_date and to_date:
        filters.append(["creation", "between", [get_datetime(from_date), get_datetime(add_days(to_date, 1))]])

    # Only count non-null departments
    data = frappe.db.sql("""
        SELECT department, COUNT(name) as count
        FROM `tabDKP_Job_Opening`
        WHERE department IS NOT NULL
        {date_filter}
        GROUP BY department
    """.format(
        date_filter="AND creation BETWEEN %s AND %s" if from_date and to_date else ""
    ),
    (get_datetime(from_date), get_datetime(add_days(to_date,1))) if from_date and to_date else (),
    as_dict=1)

    return data

import frappe
from frappe.utils import add_days

# @frappe.whitelist()
# def get_urgent_openings_jobs(from_date=None, to_date=None, limit=10, offset=0):
#     """
#     Returns urgent job openings (High / Critical priority) with pagination
#     and optional date filtering. Safe to use for Jobs Dashboard.
#     """
#     filters = [
#         ["priority", "in", ["High", "Critical"]]
#     ]

#     # Date filter
#     if from_date and to_date:
#         filters.append([
#             "creation",
#             "between",
#             [from_date, add_days(to_date, 1)]
#         ])

#     # Fetch total count
#     total = frappe.db.count("DKP_Job_Opening", filters)

#     # Fetch paginated data
#     data = frappe.get_all(
#         "DKP_Job_Opening",
#         fields=[
#             "name",
#             "designation",
#             "company",
#             "assign_recruiter",
#             "priority",
#             "number_of_positions",
#             "status"
#         ],
#         filters=filters,
#         order_by="modified desc",
#         limit_start=offset,
#         limit_page_length=limit
#     )

#     return {
#         "total": total,
#         "data": data
#     }


import frappe
from frappe.utils import get_datetime, add_days

@frappe.whitelist()
def get_client_type_distribution(from_date=None, to_date=None):
    """
    Returns counts of companies by client type for chart rendering.
    Client types: Recruitment Only / Consulting Only / Recruitment + Consulting
    """
    filters = []
    if from_date and to_date:
        filters.append(["creation", "between", [get_datetime(from_date), get_datetime(add_days(to_date, 1))]])

    # Fetch counts grouped by client_type
    data = frappe.db.sql("""
        SELECT client_type, COUNT(name) as count
        FROM `tabDKP_Company`
        WHERE client_type IS NOT NULL
        {date_filter}
        GROUP BY client_type
    """.format(
        date_filter="AND creation BETWEEN %s AND %s" if from_date and to_date else ""
    ),
    (get_datetime(from_date), get_datetime(add_days(to_date, 1))) if from_date and to_date else (),
    as_dict=1)

    # Return in chart-friendly format
    labels = [d["client_type"] for d in data]
    values = [d["count"] for d in data]

    chart = {
        "data": {
            "labels": labels,
            "datasets": [{"name": "Clients", "values": values}]
        },
        "type": "bar"
    }

    return chart
@frappe.whitelist()
def get_distinct_industries():
    rows = frappe.db.sql("""
        SELECT DISTINCT
            TRIM(LOWER(industry)) AS industry
        FROM `tabDKP_Company`
        WHERE industry IS NOT NULL
          AND industry != ''
        ORDER BY industry
    """, as_dict=True)

    return [r["industry"].title() for r in rows]
import frappe
from frappe.utils import get_datetime, add_days

@frappe.whitelist()
def get_company_table(from_date=None, to_date=None, limit=20, offset=0,client_type=None,
    industry=None,
    client_status=None,):
    """
    Returns paginated company table data with summary columns.
    Filters respect DKP_Company.creation.
    """
    limit = int(limit)
    offset = int(offset)

    filters = []
    if from_date and to_date:
        filters.append(["creation", "between", [get_datetime(from_date), get_datetime(add_days(to_date, 1))]])

    # Apply additional filters
    if client_type:
        filters.append(["client_type", "=", client_type])
    if industry:
        filters.append(["industry", "=", industry])
    if client_status:
        filters.append(["client_status", "=", client_status])

    # Fetch companies
    companies = frappe.get_all(
        "DKP_Company",
        fields=[
            "name",
            "company_name",
            "client_type",
            "industry",
            "client_status",
            "no_poach_flag",
            "replacement_policy_days"
        ],
        filters=filters,
        limit_start=offset,
        limit_page_length=limit,
        order_by="creation desc"
    )

    company_names = [c.name for c in companies]

    # Fetch Open Jobs count per company
    job_counts = {}
    if company_names:
        job_data = frappe.db.sql("""
            SELECT company, COUNT(name) as count
            FROM `tabDKP_Job_Opening`
            WHERE status='Open' AND company IN %(companies)s
            GROUP BY company
        """, {"companies": tuple(company_names)}, as_dict=1)

        job_counts = {d["company"]: d["count"] for d in job_data}

    # Build final table data
    result = []
    for c in companies:
        result.append({
            "company_name": c.name,
            "client_type": c.client_type,
            "industry": c.industry,
            "client_status": c.client_status,
            "open_jobs": job_counts.get(c.name, 0),
            # "active_applications": application_counts.get(c.name, 0),
            "no_poach": c.no_poach_flag or None,
            "replacement_days": c.replacement_policy_days
        })

    # Total count for pagination
    total = frappe.db.count("DKP_Company", filters)

    return {"total": total, "data": result}

# # candidate table tab structured queries and functions
# import frappe
# from frappe.utils import get_datetime, add_days

# @frappe.whitelist()
# def get_candidate_table(
#     from_date=None,
#     to_date=None,
#     limit=20,
#     offset=0,

#     department=None,
#     current_designation=None,
#     min_experience=None,
#     max_experience=None,

#     search_text=None,
#     candidate_name_search=None 
# ):
#     limit = int(limit)
#     offset = int(offset)

#     filters = []

#     # ---------------- Date Filter (GLOBAL) ----------------
#     if from_date and to_date:
#         filters.append([
#             "creation",
#             "between",
#             [get_datetime(from_date), get_datetime(add_days(to_date, 1))]
#         ])

#     # ---------------- Structured Filters ----------------
#     if department:
#         filters.append(["department", "=", department])

#     if current_designation:
#         filters.append([
#             "current_designation",
#             "like",
#             f"%{current_designation}%"
#         ])


#     if min_experience not in (None, "", "null"):
#         filters.append(
#             ["total_experience_years", ">=", float(min_experience)]
#         )

#     if max_experience not in (None, "", "null"):
#         filters.append(
#             ["total_experience_years", "<=", float(max_experience)]
#         )


#     # ---------------- Search Conditions ----------------
#     if candidate_name_search:
#         filters.append([
#             "candidate_name",
#             "like",
#             f"%{candidate_name_search}%"
#         ])
#     or_filters = []
#     if search_text:
#         search_text = f"%{search_text}%"
#         or_filters = [
#             ["skills_tags", "like", search_text],
#             ["primary_skill_set", "like", search_text],
#             ["secondary_skill_set", "like", search_text],
#             ["key_certifications", "like", search_text],
#         ]

#     # ---------------- Fetch Data ----------------
#     candidates = frappe.get_all(
#         "DKP_Candidate",
#         fields=[
#             "name",
#             "candidate_name",
#             "email",
#             "mobile_number",
#             "department",
#             "current_designation",
#             "total_experience_years",
#             "skills_tags",
#             "primary_skill_set",
#             "secondary_skill_set",
#             "key_certifications",
#             "creation"
#         ],
#         filters=filters,
#         or_filters=or_filters,
#         order_by="creation desc",
#         limit_start=offset,
#         limit_page_length=limit
#     )
#     # ---------------- Total Count ----------------
#     if or_filters:
#         total = len(
#             frappe.get_all(
#                 "DKP_Candidate",
#                 filters=filters,
#                 or_filters=or_filters,
#                 pluck="name"
#             )
#         )
#     else:
#         total = frappe.db.count(
#             "DKP_Candidate",
#             filters=filters
#         )

#     return {
#         "total": total,
#         "data": candidates
#     }
from rapidfuzz import fuzz
import frappe
from frappe.utils import get_datetime, add_days

def compute_candidate_score(c, query):
    score = 0
    query = query.lower()

    if c.get("candidate_name"):
        score = max(
            score,
            fuzz.partial_ratio(query, c["candidate_name"].lower()) * 1.2
        )

    for field in [
        "skills_tags",
        "primary_skill_set",
        "secondary_skill_set",
        "key_certifications",
        "current_designation"
    ]:
        if c.get(field):
            score = max(
                score,
                fuzz.token_set_ratio(query, c[field].lower())
            )

    return int(score)


@frappe.whitelist()
def get_candidate_table(
    from_date=None,
    to_date=None,
    limit=20,
    offset=0,

    department=None,
    current_designation=None,
    min_experience=None,
    max_experience=None,

    search_text=None,
    candidate_name_search=None
):
    limit = int(limit)
    offset = int(offset)

    filters = []

    # ---------------- Date Filter ----------------
    if from_date and to_date:
        filters.append([
            "creation",
            "between",
            [get_datetime(from_date), get_datetime(add_days(to_date, 1))]
        ])

    # ---------------- Structured Filters ----------------
    if department:
        filters.append(["department", "=", department])

    if current_designation:
        filters.append(["current_designation", "like", f"%{current_designation}%"])

    if min_experience not in (None, "", "null"):
        filters.append(["total_experience_years", ">=", float(min_experience)])

    if max_experience not in (None, "", "null"):
        filters.append(["total_experience_years", "<=", float(max_experience)])

    # ---------------- Fetch Base Data ----------------
    candidates = frappe.get_all(
        "DKP_Candidate",
        fields=[
            "name",
            "candidate_name",
            "email",
            "mobile_number",
            "department",
            "current_designation",
            "total_experience_years",
            "skills_tags",
            "primary_skill_set",
            "secondary_skill_set",
            "key_certifications",
            "creation"
        ],
        filters=filters,
        order_by="creation desc",
        # limit_page_length=500 include if slower performance
    )

    # ---------------- Fuzzy Search ----------------
    if search_text or candidate_name_search:
        query = (candidate_name_search or search_text).strip()
        scored_candidates = []

        for c in candidates:
            score = compute_candidate_score(c, query)
            if score >= 70 or (len(query) <= 3 and score >= 40):
                c["_score"] = score
                scored_candidates.append(c)


        scored_candidates.sort(key=lambda x: x["_score"], reverse=True)

        total = len(scored_candidates)
        candidates = scored_candidates[offset: offset + limit]

    else:
        total = len(candidates)
        candidates = candidates[offset: offset + limit]

    return {
        "total": total,
        "data": candidates
    }


from frappe.utils import cint

@frappe.whitelist()
def get_jobs_table(from_date=None, to_date=None, limit=20, offset=0,company_name=None,
                   designation=None, department=None, recruiter=None, status=None):

    conditions = []
    values = []

    if from_date:
        conditions.append("creation >= %s")
        values.append(from_date + " 00:00:00")
    if to_date:
        conditions.append("creation <= %s")
        values.append(to_date + " 23:59:59")
    if company_name:
        conditions.append("company_name LIKE %s")
        values.append(f"%{company_name}%")    
    if designation:
        conditions.append("designation LIKE %s")
        values.append(f"%{designation}%")
    if department:
        conditions.append("department = %s")
        values.append(department)
    # if recruiter:
    #     conditions.append("assign_recruiter LIKE %s")
    #     values.append(f"%{recruiter}%")
    if status:
        conditions.append("status = %s")
        values.append(status)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    # Filtered total
    total = frappe.db.sql(f"""
        SELECT COUNT(*) 
        FROM `tabDKP_Job_Opening`
        {where_clause}
    """, values)[0][0]

    # Get paged data
    data = frappe.db.sql(f"""
        SELECT name, designation, company_name, department,  
               status, number_of_positions, creation
        FROM `tabDKP_Job_Opening`
        {where_clause}
        ORDER BY creation DESC
        LIMIT {cint(limit)} OFFSET {cint(offset)}
    """, values, as_dict=1)

    return {"data": data, "total": total}

# @frappe.whitelist()
# def get_job_applications_table(from_date=None, to_date=None, limit=20, offset=0,
#                                 company_name=None, job_opening_title=None, designation=None):
#     """
#     Returns paginated job applications table data with filters and date filters.
#     Fetches from DKP_Job_Application doctype with child table candidates.
#     """
#     limit = int(limit)
#     offset = int(offset)

#     conditions = []
#     values = []

#     # Date filters
#     if from_date:
#         conditions.append("ja.creation >= %s")
#         values.append(from_date + " 00:00:00")
#     if to_date:
#         conditions.append("ja.creation <= %s")
#         values.append(to_date + " 23:59:59")
    
#     # Additional filters
#     if company_name:
#         conditions.append("ja.company_name LIKE %s")
#         values.append(f"%{company_name}%")
#     if job_opening_title:
#         conditions.append("ja.job_opening_title LIKE %s")
#         values.append(f"%{job_opening_title}%")
#     if designation:
#         conditions.append("ja.designation LIKE %s")
#         values.append(f"%{designation}%")

#     where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

#     # Filtered total
#     total = frappe.db.sql(f"""
#         SELECT COUNT(DISTINCT ja.name) 
#         FROM `tabDKP_Job_Application` ja
#         {where_clause}
#     """, values)[0][0]

#     # Get paged job applications
#     applications = frappe.db.sql(f"""
#         SELECT ja.name, ja.company_name, ja.job_opening_title, ja.designation, 
#                ja.joining_date, ja.creation
#         FROM `tabDKP_Job_Application` ja
#         {where_clause}
#         ORDER BY ja.creation DESC
#         LIMIT {cint(limit)} OFFSET {cint(offset)}
#     """, values, as_dict=1)

#     # Get child table candidates for each application
#     application_names = [app.name for app in applications]
#     candidates_data = {}
    
#     if application_names:
#         # Get all candidates for these applications
#         candidates = frappe.db.sql("""
#             SELECT parent, candidate_name, stage, interview_date, interview_feedback, name
#             FROM `tabDKP_JobApplication_Child`
#             WHERE parent IN %(applications)s
#             ORDER BY modified DESC
#         """, {"applications": tuple(application_names)}, as_dict=1)
        
#         # Group candidates by parent application
#         for candidate in candidates:
#             if candidate.parent not in candidates_data:
#                 candidates_data[candidate.parent] = []
#             candidates_data[candidate.parent].append(candidate)
    
#     # Attach candidates to each application
#     for app in applications:
#         app.candidates = candidates_data.get(app.name, [])
#         app.candidates_count = len(app.candidates)

#     return {"data": applications, "total": total}

def compute_company_score(c, query):
    score = 0
    query = query.lower()

    for field in ["company_name", "industry", "state", "city"]:
        if c.get(field):
            score = max(
                score,
                fuzz.token_set_ratio(query, c[field].lower())  # better than partial_ratio
            )
    return int(score)

import frappe

# @frappe.whitelist()
# def get_companies(from_date=None, to_date=None, company_name=None, client_type=None,
#                   industry=None, state=None, city=None, client_status=None,
#                   limit_start=0, limit_page_length=50):

#     filters = {}

#     # ---- Text Filters ----
#     if company_name:
#         filters["company_name"] = ["like", f"%{company_name}%"]

#     if client_type:
#         filters["client_type"] = client_type

#     if industry:
#         filters["industry"] = ["like", f"%{industry}%"]

#     if state:
#         filters["state"] = ["like", f"%{state}%"]

#     if city:
#         filters["city"] = ["like", f"%{city}%"]

#     if client_status:
#         filters["client_status"] = client_status

#     # ---- Date Filter: (global filter) ----
#     if from_date and to_date:
#         filters["creation"] = ["between", [from_date, to_date]]  # can switch to "modified"

#     # ---- Fetch Total Rows for Pagination ----
#     total = frappe.db.count("DKP_Company", filters=filters)

#     # ---- Fetch Company Records ----
#     data = frappe.db.get_list(
#         "DKP_Company",
#         filters=filters,
#         fields=[
#             "name", "company_name", "client_type", "industry",
#             "state", "city", "billing_address", "billing_mail",
#             "billing_number", "client_status", "replacement_policy_days",
#             "standard_fee_type", "creation"
#         ],
#         limit_start=limit_start,
#         limit_page_length=limit_page_length,
#         order_by="creation desc"
#     )

#     return {"data": data, "total": total}

@frappe.whitelist()
def get_companies(
    from_date=None, to_date=None,
    company_name=None, industry=None, state=None, city=None,
    client_type=None, client_status=None,
    limit_start=0, limit_page_length=50
):

    # 🔥 IMPORTANT FIX
    limit_start = int(limit_start or 0)
    limit_page_length = int(limit_page_length or 50)

    filters = {}

    # ---- NON-FUZZY DROPDOWN FILTERS ----
    if client_type:
        filters["client_type"] = client_type

    if client_status:
        filters["client_status"] = client_status

    if from_date and to_date:
        filters["creation"] = ["between", [from_date, to_date]]

    # ---- FETCH BASE DATA ----
    companies = frappe.get_all(
        "DKP_Company",
        filters=filters,
        fields=[
            "name", "company_name", "client_type", "industry",
            "state", "city", "billing_address", "billing_mail",
            "billing_number", "client_status",
            "replacement_policy_days", "standard_fee_type", "creation"
        ],
        order_by="creation desc",
    )

    # ---- FUZZY SEARCH ----
    search_text = company_name or industry or state or city

    if search_text:

        def compute_company_score(c, query):
            score = 0
            query = query.lower()

            if c.get("company_name"):
                score = max(score, fuzz.token_set_ratio(query, c["company_name"].lower()) * 1.2)

            for field in ["industry", "state", "city"]:
                if c.get(field):
                    score = max(score, fuzz.token_set_ratio(query, c[field].lower()))

            return int(score)

        scored = []
        query = search_text.strip().lower()

        for c in companies:
            score = compute_company_score(c, query)
            threshold = 40 if len(query) <= 5 else 60
            if score >= threshold:
                c["_score"] = score
                scored.append(c)

        scored.sort(key=lambda x: x["_score"], reverse=True)
        total = len(scored)
        data = scored[limit_start: limit_start + limit_page_length]

    else:
        total = len(companies)
        data = companies[limit_start: limit_start + limit_page_length]

    return {
        "data": data,
        "total": total
    }

# //

