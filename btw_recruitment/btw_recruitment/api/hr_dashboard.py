import frappe
from frappe.utils import add_days
@frappe.whitelist()
def get_active_applications(limit=10, offset=0,from_date=None, to_date=None):
    limit = int(limit)
    offset = int(offset)

    active_filters = [
        ["parenttype", "=", "DKP_Job_Application"],
        ["stage", "in", ["", "In Review", "Screening", "Interview", "Offered"]]
    ]
    if from_date and to_date:
        active_filters.append([
            "creation",
            "between",
            [from_date, add_days(to_date, 1)]
        ])
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

# import frappe
# from frappe.utils import now_datetime, add_days

# @frappe.whitelist()
# def get_job_health(from_date=None, to_date=None):
#     job_filters = []

#     # Date filter (same pattern as everywhere)
#     if from_date and to_date:
#         job_filters.append([
#             "creation",
#             "between",
#             [from_date, add_days(to_date, 1)]
#         ])

#     jobs = frappe.get_all(
#         "DKP_Job_Opening",
#         fields=[
#             "name",
#             "designation",
#             "department",
#             "number_of_positions",
#             "status",
#             "priority",
#             "sla_due_date"
#         ],
#         filters=job_filters
#     )

#     now = now_datetime()
#     result = []

#     for job in jobs:
#         # ---------------- CANDIDATE COUNT ----------------
#         job_applications = frappe.get_all(
#             "DKP_Job_Application",
#             filters={
#                 "job_opening_title": job.name
#             },
#             pluck="name"
#         )

#         candidate_count = 0

#         if job_applications:
#             candidate_count = frappe.db.count(
#                 "DKP_JobApplication_Child",
#                 {
#                     "parent": ["in", job_applications],
#                     "parenttype": "DKP_Job_Application",
#                     "stage": ["in", ["In Review", "Screening", "Interview", "Offered"]]
#                 }
#             )

#         positions = int(job.number_of_positions or 0)


#         # ---------------- FILL % ----------------
#         fill_percent = (
#             round((candidate_count / positions) * 100, 1)
#             if positions > 0 else 0
#         )

#         # ---------------- OVER CAPACITY ----------------
#         over_capacity = candidate_count > positions if positions else False

#         # ---------------- SLA STATUS ----------------
#         sla_status = "On Track"

#         if job.sla_due_date:
#             if job.sla_due_date < now:
#                 sla_status = "Breached"
#             elif job.sla_due_date <= add_days(now, 3):
#                 sla_status = "At Risk"

#         result.append({
#             "job_opening": job.designation,
#             "department": job.department,
#             "positions": positions,
#             "candidates": candidate_count,
#             "fill_percent": fill_percent,
#             "over_capacity": over_capacity,
#             "status": job.status,
#             "priority": job.priority,
#             "sla_status": sla_status
#         })

#     return result
import frappe
from frappe.utils import now_datetime, add_days

@frappe.whitelist()
def get_job_health(from_date=None, to_date=None, limit=10, offset=0):
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
                    "stage": ["in", ["In Review", "Screening", "Interview", "Offered"]]
                }
            )

        positions = int(job.number_of_positions or 0)

        # ---------------- FILL % ----------------
        fill_percent = round((candidate_count / positions) * 100, 1) if positions else 0

        # ---------------- OVER CAPACITY ----------------
        # OVER CAPACITY
        if positions:
            over_capacity = candidate_count > positions
        else:
            over_capacity = candidate_count > 0 

        # ---------------- SLA STATUS ----------------
        # sla_status = "On Track"
        # if job.sla_due_date:
        #     if job.sla_due_date < now:
        #         sla_status = "Breached"
        #     elif job.sla_due_date <= add_days(now, 3):
        #         sla_status = "At Risk"
        CLOSED_STATUSES = ["Closed – Hired", "Closed – Cancelled"]
        # ---------------- SLA STATUS ----------------
        sla_status = "On Track"

        if job.status in CLOSED_STATUSES:
            sla_status = "Closed"
        else:
            if job.sla_due_date:
                    if job.sla_due_date < now:
                        sla_status = "Breached"
                    elif job.sla_due_date <= add_days(now, 3):
                        sla_status = "At Risk"

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
            "fill_percent": fill_percent,
            "over_capacity": over_capacity,
            "status": job.status,
            "priority": job.priority,
            "sla_status": sla_status,
            "sla_due_date": job.sla_due_date,
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

@frappe.whitelist()
def get_urgent_openings_jobs(from_date=None, to_date=None, limit=10, offset=0):
    """
    Returns urgent job openings (High / Critical priority) with pagination
    and optional date filtering. Safe to use for Jobs Dashboard.
    """
    filters = [
        ["priority", "in", ["High", "Critical"]]
    ]

    # Date filter
    if from_date and to_date:
        filters.append([
            "creation",
            "between",
            [from_date, add_days(to_date, 1)]
        ])

    # Fetch total count
    total = frappe.db.count("DKP_Job_Opening", filters)

    # Fetch paginated data
    data = frappe.get_all(
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
        order_by="modified desc",
        limit_start=offset,
        limit_page_length=limit
    )

    return {
        "total": total,
        "data": data
    }
