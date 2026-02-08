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

    # ---------------- Companies base filter (Customer with custom fields) ----------------
    company_filters = []
    if date_filter:
        company_filters.append(["creation", *date_filter])

    # ---------------- KPI 1: Total Clients (Customer) ----------------
    total_companies = frappe.db.count("Customer", company_filters)

    # ---------------- KPI 2: Active Clients (uses custom_client_status) ----------------
    active_clients = frappe.db.count(
        "Customer",
        company_filters + [["custom_client_status", "=", "Active"]]
    )

    # ---------------- KPI 3: Inactive Clients ----------------
    inactive_clients = frappe.db.count(
        "Customer",
        company_filters + [["custom_client_status", "=", "Inactive"]]
    )

    companies_with_open_jobs = 0

    if date_filter:
        companies_with_open_jobs = frappe.db.sql(
            """
            SELECT COUNT(DISTINCT jo.company_name)
            FROM `tabDKP_Job_Opening` jo
            WHERE jo.status = 'Open'
            AND jo.creation BETWEEN %(from)s AND %(to)s
            """,
            {
                "from": date_filter[1][0],
                "to": date_filter[1][1],
            }
        )[0][0] or 0
    else:
        companies_with_open_jobs = frappe.db.sql(
            """
            SELECT COUNT(DISTINCT jo.company_name)
            FROM `tabDKP_Job_Opening` jo
            WHERE jo.status = 'Open'
            """
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
        {"kpi": "Clients with Open Jobs", "value": companies_with_open_jobs},
        # {"kpi": "Companies with Active Applications", "value": companies_with_active_applications},
    ]

    # ---------------- CHART: Industry-wise Client Count ----------------
    # Industry is stored in custom_industry on Customer
    industry_conditions = ["custom_industry IS NOT NULL"]
    values = {}

    if date_filter:
        industry_conditions.append("creation BETWEEN %(from)s AND %(to)s")
        values["from"] = date_filter[1][0]
        values["to"] = date_filter[1][1]

    industry_data = frappe.db.sql(
        f"""
        SELECT custom_industry, COUNT(name)
        FROM `tabCustomer`
        WHERE {" AND ".join(industry_conditions)}
        GROUP BY custom_industry
        """,
        values,
    )

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
