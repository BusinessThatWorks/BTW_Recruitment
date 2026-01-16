import frappe
from frappe.utils import get_datetime, add_days
def get_date_filter(filters):
    if not filters:
        return None

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")

    if from_date and to_date:
        return [
            "between",
            [
                get_datetime(from_date),
                get_datetime(add_days(to_date, 1))
            ]
        ]

    return None

def execute(filters=None):
    columns = [
        {"label": "Total Candidates", "fieldname": "total_candidates", "fieldtype": "Int"},
        {"label": "Blacklisted Candidates", "fieldname": "blacklisted_candidates", "fieldtype": "Int"},
        {"label": "Active Applications", "fieldname": "active_applications", "fieldtype": "Int"},
        {"label": "Jobs Offered", "fieldname": "offers_released", "fieldtype": "Int"},
            {"label": "Total Job Openings", "fieldname": "total_job_openings", "fieldtype": "Int"},

    ]

    total_candidates = frappe.db.count("DKP_Candidate")
    blacklisted_candidates = frappe.db.count(
                            "DKP_Candidate",
                            {"blacklisted": "Yes"}
                        )

    date_filter = get_date_filter(filters)

#     # ---------------- ACTIVE APPLICATIONS ----------------
#     active_filters = [
#     ["parenttype", "=", "DKP_Job_Application"],
#     ["stage", "in", ["", "In Review", "Screening", "Interview","Offered"]]
# ]

#     if date_filter:
#         active_filters.append(["creation", *date_filter])

#     active_applications = frappe.db.count(
#         "DKP_JobApplication_Child",
#         active_filters
#     )

        # ---------------- OFFERS RELEASED ----------------
#     offer_filters = [
#     ["parenttype", "=", "DKP_Job_Application"],
#     ["stage", "=", "Offered"]
# ]

#     if date_filter:
#         offer_filters.append(["creation", *date_filter])

#     offers_released = frappe.db.count(
#         "DKP_JobApplication_Child",
#         offer_filters
#     )
    # ---------------- TOTAL JOB OPENINGS ----------------
    job_opening_filters = []

    if date_filter:
        job_opening_filters.append(["creation", *date_filter])

    total_job_openings = frappe.db.count(
        "DKP_Job_Opening",
        job_opening_filters
    )

    data = [{
        "total_candidates": total_candidates,
        "blacklisted_candidates": blacklisted_candidates,
        # "active_applications": active_applications,
        # "offers_released": offers_released,
        "total_job_openings": total_job_openings
    }]

    # ---------------- CHART DATA ----------------
    stages = ["In Review", "Shortlisted For Interview", "Interview in Progress","Selected", "Offered", "Offer Drop","Joined"]
    stage_counts = []

    for stage in stages:
        
        stage_filters = [
    ["parenttype", "=", "DKP_Job_Application"],
    ["stage", "=", stage]
]

        if date_filter:
            stage_filters.append(["creation", *date_filter])

        count = frappe.db.count(
            "DKP_JobApplication_Child",
            stage_filters
        )

        stage_counts.append(count)

    chart = {
        "data": {
            "labels": stages,
            "datasets": [
                {
                    "name": "Candidates",
                    "values": stage_counts
                }
            ]
        },
        "type": "bar"
    }

    return columns, data, None, chart
