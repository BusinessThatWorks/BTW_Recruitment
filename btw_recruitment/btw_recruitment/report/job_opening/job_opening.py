# Copyright (c) 2026, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint


def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "label": "Job Opening",
            "fieldname": "name",
            "fieldtype": "Link",
            "options": "DKP_Job_Opening",
            "width": 180
        },
        {
            "label": "Company",
            "fieldname": "company_name",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": "Designation",
            "fieldname": "designation",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": "Department",
            "fieldname": "department",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": "Recruiters",
            "fieldname": "recruiters",
            "fieldtype": "Data",
            "width": 200
        },
        {
            "label": "Status",
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": "Priority",
            "fieldname": "priority",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": "Positions",
            "fieldname": "number_of_positions",
            "fieldtype": "Int",
                        "width": 180

        },
        {
            "label": "Created On",
            "fieldname": "creation",
            "fieldtype": "Date",
                        "width": 180

        },
        {
            "label": "Ageing (Days)",
            "fieldname": "ageing",
            "fieldtype": "Int",
                        "width": 180

        },
    ]


def get_data(filters):
    if not filters:
        filters = {}

    conditions = []
    values = {}

    # ---------------- Date Filters ----------------
    if filters.get("from_date"):
        conditions.append("jo.creation >= %(from_date)s")
        values["from_date"] = str(filters.get("from_date")) + " 00:00:00"
    
    if filters.get("to_date"):
        conditions.append("jo.creation <= %(to_date)s")
        values["to_date"] = str(filters.get("to_date")) + " 23:59:59"

    # ---------------- Other Filters (if uncommented in JS) ----------------
    if filters.get("company_name"):
        conditions.append("jo.company_name LIKE %(company_name)s")
        values["company_name"] = f"%{filters.get('company_name')}%"

    if filters.get("designation"):
        conditions.append("jo.designation LIKE %(designation)s")
        values["designation"] = f"%{filters.get('designation')}%"

    if filters.get("department"):
        conditions.append("jo.department = %(department)s")
        values["department"] = filters.get("department")

    if filters.get("status"):
        conditions.append("jo.status = %(status)s")
        values["status"] = filters.get("status")

    if filters.get("priority"):
        conditions.append("jo.priority = %(priority)s")
        values["priority"] = filters.get("priority")

    if filters.get("ageing"):
        conditions.append("DATEDIFF(CURDATE(), jo.creation) >= %(ageing)s")
        values["ageing"] = cint(filters.get("ageing"))

    # ---------------- Recruiter Filter ----------------
    if filters.get("recruiter"):
        conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabDKP_JobOpeningRecruiter_Child` r
                WHERE r.parent = jo.name AND r.recruiter_name = %(recruiter)s
            )
        """)
        values["recruiter"] = filters.get("recruiter")

    # ---------------- Build WHERE Clause ----------------
    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    # ---------------- Build ORDER BY ----------------
    order_by = get_order_by(filters)

    # ---------------- Main Query ----------------
    data = frappe.db.sql(
        f"""
        SELECT
            jo.name,
            jo.company_name,
            jo.designation,
            jo.department,
            jo.status,
            jo.priority,
            jo.number_of_positions,
            DATE(jo.creation) as creation,
            DATEDIFF(CURDATE(), jo.creation) as ageing
        FROM `tabDKP_Job_Opening` jo
        {where_clause}
        ORDER BY {order_by}
        """,
        values,
        as_dict=1,
    )

    # ---------------- Fetch Recruiters ----------------
    for job in data:
        recruiters = frappe.db.sql(
            """
            SELECT recruiter_name
            FROM `tabDKP_JobOpeningRecruiter_Child`
            WHERE parent = %s
            """,
            job.name,
            as_dict=1,
        )
        job["recruiters"] = ", ".join([r.recruiter_name for r in recruiters]) if recruiters else "-"

    return data


def get_order_by(filters):
    """Build ORDER BY clause from filters"""
    
    sort_by = filters.get("sort_by", "creation")
    sort_order = filters.get("sort_order", "Desc")
    
    # Validate sort_order
    if sort_order and sort_order.lower() == "asc":
        sort_order = "ASC"
    else:
        sort_order = "DESC"
    
    # Map fieldname to SQL column (whitelist for security)
    allowed_fields = {
        "name": "jo.name",
        "company_name": "jo.company_name",
        "designation": "jo.designation",
        "department": "jo.department",
        "status": "jo.status",
        "priority": "jo.priority",
        "number_of_positions": "jo.number_of_positions",
        "creation": "jo.creation",
        "ageing": "DATEDIFF(CURDATE(), jo.creation)"
    }
    
    # Get SQL field or default
    sql_field = allowed_fields.get(sort_by, "jo.creation")
    
    return f"{sql_field} {sort_order}"