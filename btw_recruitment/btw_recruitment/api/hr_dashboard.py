import frappe
from frappe.utils import add_days
@frappe.whitelist()
def get_active_applications(limit=10, offset=0,from_date=None, to_date=None,stage=None):
    limit = int(limit)
    offset = int(offset)

    # Default stages
    default_stages = ["", "In Review", "Screening", "Interview", "Offered"]

    # Base filters
    active_filters = [
        ["parenttype", "=", "DKP_Job_Application"],
        ["stage", "in", default_stages]
    ]

    # Apply date filter if provided
    if from_date and to_date:
        active_filters.append([
            "creation",
            "between",
            [from_date, add_days(to_date, 1)]
        ])

    # Apply Stage filter if selected
    if stage:
        if stage == "No Assigned Stage":
            active_filters.append(["stage", "=", ""])  # blank stage
        else:
            active_filters.append(["stage", "=", stage])
    data = frappe.get_all(
        "DKP_JobApplication_Child",
        fields=[
            "candidate_name",
            "stage",
            "interview_date",
            "parent as job_application"
        ],
        filters=active_filters,
        order_by="modified desc",
        limit_start=offset,
        limit_page_length=limit
    )

    total = frappe.db.count(
    "DKP_JobApplication_Child",
    active_filters
)


    return {
        "total": total,
        "data": data
    }


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
            "company",
            "assign_recruiter",
            "priority",
            "number_of_positions",
            "status"
        ],
        filters=filters,
        order_by="modified desc"
    )
import frappe
from frappe.utils import now_datetime, add_days
from frappe.utils import format_datetime

@frappe.whitelist()
def get_job_health(from_date=None, to_date=None, limit=10, offset=0,department=None,
priority=None,
sla_status=None):
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

    # SLA Status
    if sla_status:
        if sla_status == "Open":
            job_filters.append(["status", "=", "Open"])
        elif sla_status == "On Hold":
            job_filters.append(["status", "=", "On Hold"])
        elif sla_status == "Closed – Hired":
            job_filters.append(["status", "=", "Closed – Hired"])
        elif sla_status == "Closed – Cancelled":
            job_filters.append(["status", "=", "Closed – Cancelled"])

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
            "sla_due_date"
        ],
        filters=job_filters,
        limit_start=offset,
        limit_page_length=limit
    )

    # Total count (for pagination)
    total = frappe.db.count(
        "DKP_Job_Opening",
        filters=job_filters
    )

    now = now_datetime()
    result = []

    for job in jobs:
        # ---------------- CANDIDATE COUNT ----------------
        job_applications = frappe.get_all(
            "DKP_Job_Application",
            filters={"job_opening_title": job.name},
            pluck="name"
        )

        candidate_count = 0
        if job_applications:
            candidate_count = frappe.db.count(
                "DKP_JobApplication_Child",
                {
                    "parent": ["in", job_applications],
                    "parenttype": "DKP_Job_Application",
                    "stage": ["in", ["In Review", "Screening", "Interview", "Offered","","Rejected","Offer Drop"]]
                }
            )

        positions = int(job.number_of_positions or 0)

        CLOSED_STATUSES = ["Closed – Hired", "Closed – Cancelled"]
        # ---------------- SLA STATUS ----------------
        sla_status = "On Track"

        if job.status in CLOSED_STATUSES:
            sla_status = job.status
        else:
            if job.sla_due_date:
                sla_due = get_datetime(job.sla_due_date)

                if sla_due < now:
                    sla_status = "Breached"
                elif sla_due <= add_days(now, 3):
                    sla_status = "At Risk"
                else:
                    sla_status = "On Track"

        job_applications = frappe.get_all(
            "DKP_Job_Application",
            fields=["name"],
            filters={
                "company_name": job.company   # SAME LINK FIELD
            }
        )

        application_links = [app.name for app in job_applications]
        result.append({
            "job_opening": job.name,
            "designation":job.designation,
            "department": job.department,
            "positions": positions,
            "candidates": candidate_count,
            "status": job.status,
            "priority": job.priority,
            "sla_status": sla_status,
            "sla_due_date": format_datetime(
            job.sla_due_date,
            "dd-MM-yyyy hh:mm a"
        ) if job.sla_due_date else None,

            "job_applications": application_links
        })

    return {"total": total, "data": result}


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

    # Fetch Active Applications count per company
    application_counts = {}
    if company_names:
        app_data = frappe.db.sql("""
            SELECT jo.company, COUNT(ja.name) as count
            FROM `tabDKP_Job_Application` ja
            INNER JOIN `tabDKP_Job_Opening` jo
                ON ja.job_opening_title = jo.name
            WHERE jo.company IN %(companies)s
            GROUP BY jo.company
        """, {"companies": tuple(company_names)}, as_dict=1)

        application_counts = {d["company"]: d["count"] for d in app_data}

    # Build final table data
    result = []
    for c in companies:
        result.append({
            "company_name": c.name,
            "client_type": c.client_type,
            "industry": c.industry,
            "client_status": c.client_status,
            "open_jobs": job_counts.get(c.name, 0),
            "active_applications": application_counts.get(c.name, 0),
            "no_poach": c.no_poach_flag,
            "replacement_days": c.replacement_policy_days
        })

    # Total count for pagination
    total = frappe.db.count("DKP_Company", filters)

    return {"total": total, "data": result}

# candidate table tab structured queries and functions
import frappe
from frappe.utils import get_datetime, add_days

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

    search_text=None
):
    limit = int(limit)
    offset = int(offset)

    filters = []

    # ---------------- Date Filter (GLOBAL) ----------------
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
        filters.append(["current_designation", "=", current_designation])

    if min_experience not in (None, "", "null"):
        filters.append(
            ["total_experience_years", ">=", float(min_experience)]
        )

    if max_experience not in (None, "", "null"):
        filters.append(
            ["total_experience_years", "<=", float(max_experience)]
        )


    # ---------------- Search Conditions ----------------
    or_filters = []
    if search_text:
        search_text = f"%{search_text}%"
        or_filters = [
            ["candidate_name", "like", search_text],
            ["skills_tags", "like", search_text],
            ["primary_skill_set", "like", search_text],
            ["secondary_skill_set", "like", search_text],
            ["key_certifications", "like", search_text],
        ]

    # ---------------- Fetch Data ----------------
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
        or_filters=or_filters,
        order_by="creation desc",
        limit_start=offset,
        limit_page_length=limit
    )

    # ---------------- Total Count ----------------
    total = len(
    frappe.get_all(
        "DKP_Candidate",
        filters=filters,
        or_filters=or_filters,
        pluck="name"
    )
)


    return {
        "total": total,
        "data": candidates
    }
