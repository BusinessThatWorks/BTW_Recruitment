
import frappe

@frappe.whitelist()
def get_candidates_by_department(from_date=None, to_date=None):
    filters = ""
    values = {}

    if from_date and to_date:
        filters = " AND creation BETWEEN %(from_date)s AND %(to_date)s"
        values.update({"from_date": from_date, "to_date": to_date})

    data = frappe.db.sql(f"""
    SELECT 
        IFNULL(NULLIF(TRIM(department), ''), 'Not Set') as department,
        COUNT(name) as count
    FROM `tabDKP_Candidate`
    WHERE 1=1
    {filters}
    GROUP BY IFNULL(NULLIF(TRIM(department), ''), 'Not Set')
""", values=values, as_dict=1)

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
    # Fetch counts grouped by client_type from core Customer (custom_client_type)
    data = frappe.db.sql("""
        SELECT custom_client_type AS client_type, COUNT(name) as count
        FROM `tabCustomer`
        WHERE custom_client_type IS NOT NULL
        {date_filter}
        GROUP BY custom_client_type
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
            TRIM(LOWER(custom_industry)) AS industry
        FROM `tabCustomer`
        WHERE custom_industry IS NOT NULL
          AND custom_industry != ''
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
    Now based on core Customer; filters respect Customer.creation.
    """
    limit = int(limit)
    offset = int(offset)
    filters = []
    if from_date and to_date:
        filters.append([
            "creation",
            "between",
            [get_datetime(from_date), get_datetime(add_days(to_date, 1))]
        ])
    # Apply additional filters (map to Customer custom fields)
    if client_type:
        filters.append(["custom_client_type", "=", client_type])
    if industry:
        filters.append(["custom_industry", "=", industry])
    if client_status:
        filters.append(["custom_client_status", "=", client_status])
    # Fetch companies (now from Customer)
    companies = frappe.get_all(
        "Customer",
        fields=[
            "name",
            "customer_name",
            "custom_client_type",
            "custom_industry",
            "custom_client_status",
            "custom_no_poach_flag",
            "custom_replacement_policy_",
        ],
        filters=filters,
        limit_start=offset,
        limit_page_length=limit,
        order_by="creation desc"
    )
    company_names = [c.name for c in companies]
    # Fetch Open Jobs count per company (company field on DKP_Job_Opening
    # should now point to Customer)
    job_counts = {}
    if company_names:
        job_data = frappe.db.sql(
            """
            SELECT company, COUNT(name) as count
            FROM `tabDKP_Job_Opening`
            WHERE status='Open' AND company IN %(companies)s
            GROUP BY company
            """,
            {"companies": tuple(company_names)},
            as_dict=1,
        )
        job_counts = {d["company"]: d["count"] for d in job_data}
    # Build final table data
    result = []
    for c in companies:
        result.append(
            {
                # Expose both name (docname) and a human label for UI
                "name": c.name,
                "company_name": c.customer_name or c.name,
                "client_type": c.custom_client_type,
                "industry": c.custom_industry,
                "client_status": c.custom_client_status,
                "open_jobs": job_counts.get(c.name, 0),
                "no_poach": getattr(c, "custom_no_poach_flag", None) or None,
                "replacement_days": getattr(c, "custom_replacement_policy_", None),
            }
        )

    # Total count for pagination
    total = frappe.db.count("Customer", filters)
    return {"total": total, "data": result}
import frappe
from frappe.utils import get_datetime, add_days

CANDIDATE_SORT_FIELDS = {
    "candidate_name", "department", "current_designation", "total_experience_years",
    "skills_tags", "primary_skill_set", "secondary_skill_set", "key_certifications", "creation"
}

@frappe.whitelist()
def get_candidate_table(from_date=None, to_date=None):
    """
    Simple function - sirf date filter
    Baaki sab DataTable handle karega (search, sort, filter)
    """
    filters = {}
    
    # Sirf date filter server pe
    if from_date and to_date:
        filters["creation"] = ["between", [from_date, to_date]]
    
    # Saara data ek baar fetch karo
    candidates = frappe.get_all(
        "DKP_Candidate",
        filters=filters,
        fields=[
            "name",
            "candidate_name",
            "department",
            "current_designation",
            "total_experience_years",
            "skills_tags",
            "key_certifications",
            "creation"
        ],
        order_by="creation desc"
    )
    
    return {
        "data": candidates,
        "total": len(candidates)
    }
from frappe.utils import cint
from frappe.utils import cint
import frappe
JOBS_SORT_FIELDS = {
    "name", "company_name", "designation", "department", "status",
    "priority", "number_of_positions", "creation"
}
@frappe.whitelist()
def get_jobs_table(
    from_date=None,
    to_date=None,
    limit=20,
    offset=0,
    company_name=None,
    designation=None,
    department=None,
    recruiter=None,
    status=None,
    priority=None,
    ageing=None,
    sort_by=None,
    sort_order=None
):
    conditions = []
    values = []
    
    # ---------------- Date Filters ----------------
    if from_date:
        conditions.append("jo.creation >= %s")
        values.append(from_date + " 00:00:00")
    if to_date:
        conditions.append("jo.creation <= %s")
        values.append(to_date + " 23:59:59")
    
    # ---------------- Text Filters ----------------
    if company_name:
        conditions.append("jo.company_name LIKE %s")
        values.append(f"%{company_name}%")
    if designation:
        conditions.append("jo.designation LIKE %s")
        values.append(f"%{designation}%")
    
    # ---------------- Exact Filters ----------------
    if department:
        conditions.append("jo.department = %s")
        values.append(department)
    if status:
        conditions.append("jo.status = %s")
        values.append(status)
    if priority:
        conditions.append("jo.priority = %s")
        values.append(priority)
    
    # ---------------- Ageing Filter (Days) ----------------
    if ageing not in (None, "", "null"):
        conditions.append("DATEDIFF(CURDATE(), jo.creation) >= %s")
        values.append(cint(ageing))
    
    # ---------------- Recruiter Filter (Multi-Select) ----------------
    if recruiter:
        recruiter_list = frappe.parse_json(recruiter)
        if recruiter_list:
            placeholders = ", ".join(["%s"] * len(recruiter_list))
            conditions.append(f"""
                EXISTS (
                    SELECT 1
                    FROM `tabDKP_JobOpeningRecruiter_Child` r
                    WHERE r.parent = jo.name
                    AND r.recruiter_name IN ({placeholders})
                )
            """)
            values.extend(recruiter_list)
    
    # ---------------- WHERE Clause ----------------
    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    
    order_by = "jo.creation DESC"
    if sort_by and sort_by in JOBS_SORT_FIELDS and sort_order in ("asc", "desc"):
        order_by = f"jo.{sort_by} {sort_order.upper()}"
    
    total = frappe.db.sql(
        f"""
        SELECT COUNT(DISTINCT jo.name)
        FROM `tabDKP_Job_Opening` jo
        {where_clause}
        """,
        values
    )[0][0]
    
    # ---------------- Paginated Data ----------------
    data = frappe.db.sql(
        f"""
        SELECT
            jo.name,
            jo.designation,
            jo.company_name,
            jo.department,
            jo.status,
            jo.priority,
            jo.number_of_positions,
            jo.creation
        FROM `tabDKP_Job_Opening` jo
        {where_clause}
        ORDER BY {order_by}
        LIMIT {cint(limit)} OFFSET {cint(offset)}
        """,
        values,
        as_dict=1
    )
    
    # 👇 ADD THIS - Fetch recruiters for each job
    for job in data:
        recruiters = frappe.db.sql("""
            SELECT recruiter_name 
            FROM `tabDKP_JobOpeningRecruiter_Child`
            WHERE parent = %s
        """, job.name, as_dict=1)
        
        # Join all recruiter names with comma
        job['recruiters'] = ", ".join([r.recruiter_name for r in recruiters]) if recruiters else "-"
    
    return {
        "data": data,
        "total": total
    }
@frappe.whitelist()
def get_companies(from_date=None, to_date=None):
    """
    Simple Company listing API.
    DataTable handles filtering, sorting, pagination on client-side.
    """
    # Fetch ALL records - DataTable will handle the rest
    data = frappe.db.get_list(
        "Customer",
        fields=[
            "name",
            "customer_name",
            "custom_client_type",
            "custom_industry",
            "custom_state",
            "custom_city",
            "custom_billing_email",
            "custom_billing_phone",
            "custom_client_status",
            "custom_replacement_policy_",
            "custom_standard_fee_value",
            "creation",
        ],
        order_by="creation desc",
        limit_page_length=0  # No limit - get all
    )

    # Map to expected JS field names
    for row in data:
        row["company_name"] = row.get("customer_name") or row.get("name")
        row["client_type"] = row.get("custom_client_type")
        row["industry"] = row.get("custom_industry")
        row["state"] = row.get("custom_state")
        row["city"] = row.get("custom_city")
        row["billing_mail"] = row.get("custom_billing_email")
        row["billing_number"] = row.get("custom_billing_phone")
        row["client_status"] = row.get("custom_client_status")
        row["replacement_policy_days"] = row.get("custom_replacement_policy_")
        row["standard_fee_value"] = row.get("custom_standard_fee_value")

    return {"data": data, "total": len(data)}
