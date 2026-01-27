import frappe
from frappe.utils import get_datetime, add_days, now_datetime

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
        {"label": "Total Job Openings", "fieldname": "total_jobs", "fieldtype": "Int"},
        {"label": "Active Jobs", "fieldname": "active_jobs", "fieldtype": "Int"},
        {"label": "Total Positions Open", "fieldname": "total_positions", "fieldtype": "Int"},
        {"label": "Critical Jobs", "fieldname": "priority_jobs", "fieldtype": "Int"},
        {"label": "SLA Breached Jobs", "fieldname": "sla_breached_jobs", "fieldtype": "Int"},
    ]

    date_filter = get_date_filter(filters)

    # ---------------- TOTAL JOBS ----------------
    # job_filters = []
    # if date_filter:
    #     job_filters.append(["creation", *date_filter])

    # total_jobs = frappe.db.count("DKP_Job_Opening", job_filters)
    # ---------------- TOTAL JOBS ----------------
    job_filters = []
    if date_filter:
        job_filters.append(["creation", *date_filter])

    total_jobs = frappe.db.count("DKP_Job_Opening", job_filters)


    # ---------------- ACTIVE JOBS ----------------
    # active_jobs = frappe.db.count(
    #     "DKP_Job_Opening",
    #     job_filters + [["status", "=", "Open"]]
    # )
    # ---------------- TOTAL POSITIONS ----------------
    position_filters = [["status", "=", "Open"]]
    if date_filter:
        position_filters.append(["creation", *date_filter])

    rows = frappe.get_all(
        "DKP_Job_Opening",
        fields=["number_of_positions"],
        filters=position_filters
    )

    total_positions = sum(int(row.number_of_positions or 0) for row in rows)


    # ---------------- PRIORITY JOBS ----------------
    priority_jobs = frappe.db.count(
        "DKP_Job_Opening",
        job_filters + [["priority", "in", ["Critical"]]]
    )

    # # ---------------- SLA BREACHED ----------------
    # sla_filters = job_filters + [
    #     ["sla_due_date", "<", now_datetime()],
    #     ["status", "=", "Open"]
    # ]

    # sla_breached_jobs = frappe.db.count(
    #     "DKP_Job_Opening",
    #     sla_filters
    # )

    data = [{
        "total_jobs": total_jobs,
        # "active_jobs": active_jobs,
        "total_positions": total_positions,
        "priority_jobs": priority_jobs,
        # "sla_breached_jobs": sla_breached_jobs
    }]

    # ---------------- CHART: STATUS DISTRIBUTION ----------------
    statuses = ["Open", "On Hold", "Closed – Hired", "Closed – Cancelled"]
    status_counts = []

    for status in statuses:
        chart_filters = [["status", "=", status]]

        if date_filter:
            chart_filters.append(["creation", *date_filter])

        count = frappe.db.count(
            "DKP_Job_Opening",
            chart_filters
        )
        status_counts.append(count)

    chart = {
        "data": {
            "labels": statuses,
            "datasets": [
                {
                    "name": "Jobs",
                    "values": status_counts
                }
            ]
        },
        "type": "bar"
    }

    return columns, data, None, chart
