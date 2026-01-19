import frappe
from frappe.utils import get_datetime, add_days, now_datetime

# ---------------- Helper ----------------
def get_date_filter(filters):
    if not filters:
        return None

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")

    if from_date and to_date:
        # between start of from_date and end of to_date
        return ["between", [get_datetime(from_date), get_datetime(add_days(to_date, 1))]]

    return None

# ---------------- Execute Report ----------------
def execute(filters=None):
    if not filters:
        filters = {}

    date_filter = get_date_filter(filters)

    # ---------------- Columns ----------------
    columns = [
        {"label": "KPI", "fieldname": "kpi", "fieldtype": "Data", "width": 250},
        {"label": "Value", "fieldname": "value", "fieldtype": "Int", "width": 100},
    ]

    # ---------------- Companies base filter ----------------
    company_filters = []
    if date_filter:
        company_filters.append(["creation", *date_filter])

    # ---------------- KPI 1: Total Companies ----------------
    total_companies = frappe.db.count("DKP_Company", company_filters)

    # ---------------- KPI 2: Active Clients ----------------
    active_clients = frappe.db.count(
        "DKP_Company",
        company_filters + [["client_status", "=", "Active"]]
    )

    # ---------------- KPI 3: Inactive Clients ----------------
    inactive_clients = frappe.db.count(
        "DKP_Company",
        company_filters + [["client_status", "=", "Inactive"]]
    )

    # ---------------- KPI 4: Companies with Open Jobs ----------------
    company_names = frappe.get_all(
        "DKP_Company",
        filters=company_filters,
        fields=["name"]
    )
    company_names = [c.name for c in company_names]

    companies_with_open_jobs = 0
    if company_names:
        companies_with_open_jobs = frappe.db.sql(
            """
            SELECT COUNT(DISTINCT company)
            FROM `tabDKP_Job_Opening`
            WHERE status='Open' AND company IN %(companies)s
            """,
            {"companies": tuple(company_names)}
        )[0][0] or 0

    # ---------------- KPI 5: Companies with Active Applications ----------------
    # companies_with_active_applications = 0
    # if company_names:
    #     companies_with_active_applications = frappe.db.sql(
    #         """
    #         SELECT COUNT(DISTINCT jo.company)
    #         FROM `tabDKP_Job_Application` ja
    #         INNER JOIN `tabDKP_Job_Opening` jo
    #             ON ja.job_opening_title = jo.name
    #         WHERE jo.company IN %(companies)s
    #         """,
    #         {"companies": tuple(company_names)}
    #     )[0][0] or 0

    # ---------------- KPI CARD DATA ----------------
    data = [
        {"kpi": "Total Clients", "value": total_companies},
        {"kpi": "Active Clients", "value": active_clients},
        {"kpi": "Inactive Clients", "value": inactive_clients},
        {"kpi": "Companies with Open Jobs", "value": companies_with_open_jobs},
        # {"kpi": "Companies with Active Applications", "value": companies_with_active_applications},
    ]

    # ---------------- CHART: Industry-wise Client Count ----------------
    industry_conditions = ["industry IS NOT NULL"]
    values = {}

    if date_filter:
        industry_conditions.append("creation BETWEEN %(from)s AND %(to)s")
        values["from"] = date_filter[1][0]
        values["to"] = date_filter[1][1]

    industry_data = frappe.db.sql(f"""
        SELECT industry, COUNT(name)
        FROM `tabDKP_Company`
        WHERE {" AND ".join(industry_conditions)}
        GROUP BY industry
    """, values)
    # industry_data = frappe.db.sql("""
    #     SELECT industry, COUNT(name)
    #     FROM `tabDKP_Company`
    #     WHERE industry IS NOT NULL
    #     GROUP BY industry
    # """)

    industry_labels = [row[0] for row in industry_data]
    industry_values = [row[1] for row in industry_data]

    chart_industry = {
        "data": {
            "labels": industry_labels,
            "datasets": [{"name": "Clients", "values": industry_values}]
        },
        "type": "bar"
    }

    return columns, data, None,  chart_industry
