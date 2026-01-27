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
    job_filters = []
    if date_filter:
        job_filters.append(["creation", *date_filter])

    total_jobs = frappe.db.count("DKP_Job_Opening", job_filters)

    position_filters = []

    # sirf date filter (optional)
    if date_filter:
        position_filters.append(["creation", *date_filter])

    rows = frappe.get_all(
        "DKP_Job_Opening",
        fields=["number_of_positions"],
        filters=position_filters
    )

    total_positions = sum(int(row.number_of_positions or 0) for row in rows)

    # data = [{
    #     "total_jobs": total_jobs,
    #     "total_positions": total_positions,
    #     "status_cards": status_cards
    # }]
    STATUSES = [
        "Open",
        "On Hold",
        "Closed – Hired",
        "Closed – Cancelled"
    ]

    status_cards = []

    for status in STATUSES:
            status_filters = [["status", "=", status]]
            if date_filter:
                status_filters.append(["creation", *date_filter])

            openings = frappe.db.count(
                "DKP_Job_Opening",
                status_filters
            )

            rows = frappe.get_all(
                "DKP_Job_Opening",
                fields=["number_of_positions"],
                filters=status_filters
            )

            positions = sum(int(r.number_of_positions or 0) for r in rows)

            status_cards.append({
                "status": status,
                "openings": openings,
                "positions": positions
            })

    data = [{
        "total_jobs": total_jobs,
        "total_positions": total_positions,
        "status_cards": status_cards
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


