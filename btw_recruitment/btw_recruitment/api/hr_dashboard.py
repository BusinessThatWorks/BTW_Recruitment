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

import frappe
import json
from frappe.utils import get_datetime, add_days

CANDIDATE_SORT_FIELDS = {
    "candidate_name", "department", "current_designation", "total_experience_years",
    "skills_tags", "primary_skill_set", "secondary_skill_set", "key_certifications", "creation"
}

@frappe.whitelist()
def get_candidate_table(from_date=None, to_date=None, filters=None):
    """
    Candidate listing with optional inline filters support.
    Date filter + inline column filters supported.
    """
    
    # Debug logging
    print("=" * 60)
    print("get_candidate_table called")
    print(f"from_date: {from_date}")
    print(f"to_date: {to_date}")
    print(f"filters (raw): {filters}")
    print("=" * 60)
    
    # Parse inline filters from JSON string
    parsed_filters = {}
    if filters:
        if isinstance(filters, str):
            try:
                parsed_filters = json.loads(filters)
            except:
                parsed_filters = {}
        elif isinstance(filters, dict):
            parsed_filters = filters
    
    print(f"Parsed filters: {parsed_filters}")
    
    # Build conditions
    conditions = []
    values = {}
    
    # Date filter
    if from_date:
        conditions.append("creation >= %(from_date)s")
        values["from_date"] = from_date
    
    if to_date:
        conditions.append("creation <= %(to_date)s")
        values["to_date"] = to_date
    
    # ============================================
    # INLINE FILTER MAPPING
    # Frontend Column Name -> Database Field
    # ============================================
    
    filter_mapping = {
        "Candidate": "candidate_name",
        "Department": "department",
        "Designation": "current_designation",
        "Experience (Yrs)": "total_experience_years",
        "Skills": "skills_tags",
        "Certifications": "key_certifications"
    }
    
    for col_name, db_field in filter_mapping.items():
        if parsed_filters.get(col_name):
            filter_value = parsed_filters[col_name]
            param_name = db_field  # Use db_field as param name
            conditions.append(f"{db_field} LIKE %({param_name})s")
            values[param_name] = f"%{filter_value}%"
    
    # Build WHERE clause
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    print(f"WHERE clause: {where_clause}")
    print(f"Values: {values}")
    
    # Execute query
    query = f"""
        SELECT 
            name,
            candidate_name,
            department,
            current_designation,
            total_experience_years,
            skills_tags,
            key_certifications,
            creation
        FROM `tabDKP_Candidate`
        WHERE {where_clause}
        ORDER BY creation DESC
    """
    
    candidates = frappe.db.sql(query, values, as_dict=True)
    
    print(f"Query returned {len(candidates)} records")
    print("=" * 60)
    
    return {
        "data": candidates,
        "total": len(candidates)
    }
from frappe.utils import cint
import frappe
import json

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
    sort_order=None,
    filters=None  # 👈 NEW: Inline filters parameter
):
    
    # Debug logging
    print("=" * 60)
    print("get_jobs_table called")
    print(f"from_date: {from_date}, to_date: {to_date}")
    print(f"filters (raw): {filters}")
    print("=" * 60)
    
    # Parse inline filters from JSON string
    parsed_filters = {}
    if filters:
        if isinstance(filters, str):
            try:
                parsed_filters = json.loads(filters)
            except:
                parsed_filters = {}
        elif isinstance(filters, dict):
            parsed_filters = filters
    
    print(f"Parsed filters: {parsed_filters}")
    
    conditions = []
    values = []
    
    # ---------------- Date Filters ----------------
    if from_date:
        conditions.append("jo.creation >= %s")
        values.append(from_date + " 00:00:00")
    if to_date:
        conditions.append("jo.creation <= %s")
        values.append(to_date + " 23:59:59")
    
    # ---------------- Existing Text Filters ----------------
    if company_name:
        conditions.append("jo.company_name LIKE %s")
        values.append(f"%{company_name}%")
    if designation:
        conditions.append("jo.designation LIKE %s")
        values.append(f"%{designation}%")
    
    # ---------------- Existing Exact Filters ----------------
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
    
    # ============================================
    # 👇 NEW: INLINE FILTER MAPPING
    # Frontend Column Name -> Database Field
    # ============================================
    
    filter_mapping = {
        "Job Opening": "jo.name",
        "Company": "jo.company_name",
        "Designation": "jo.designation",
        "Department": "jo.department",
        "Status": "jo.status",
        "Priority": "jo.priority",
        "Positions": "jo.number_of_positions"
    }
    
    for col_name, db_field in filter_mapping.items():
        if parsed_filters.get(col_name):
            filter_value = parsed_filters[col_name]
            conditions.append(f"{db_field} LIKE %s")
            values.append(f"%{filter_value}%")
    
    # Ageing inline filter (special handling - numeric)
    if parsed_filters.get("Ageing"):
        try:
            ageing_val = int(parsed_filters["Ageing"])
            conditions.append("DATEDIFF(CURDATE(), jo.creation) >= %s")
            values.append(ageing_val)
        except:
            pass
    
    print(f"Conditions: {conditions}")
    print(f"Values: {values}")
    
    # ---------------- WHERE Clause ----------------
    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    
    order_by = "jo.creation DESC"
    if sort_by and sort_by in JOBS_SORT_FIELDS and sort_order in ("asc", "desc"):
        order_by = f"jo.{sort_by} {sort_order.upper()}"
    
    # ---------------- Total Count ----------------
    total = frappe.db.sql(
        f"""
        SELECT COUNT(DISTINCT jo.name)
        FROM `tabDKP_Job_Opening` jo
        {where_clause}
        """,
        values
    )[0][0]
    
    # ---------------- Data Query (No pagination for download) ----------------
    # If filters are provided, return all matching records (for download)
    if parsed_filters:
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
            """,
            values,
            as_dict=1
        )
    else:
        # Normal paginated query
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
    
    # Fetch recruiters for each job
    for job in data:
        recruiters = frappe.db.sql("""
            SELECT recruiter_name 
            FROM `tabDKP_JobOpeningRecruiter_Child`
            WHERE parent = %s
        """, job.name, as_dict=1)
        
        job['recruiters'] = ", ".join([r.recruiter_name for r in recruiters]) if recruiters else "-"
    
    # 👇 Post-filter for Recruiters (inline filter - after fetching)
    if parsed_filters.get("Recruiters"):
        recruiter_filter = parsed_filters["Recruiters"].lower()
        data = [d for d in data if d.get("recruiters") and recruiter_filter in d["recruiters"].lower()]
        total = len(data)
    
    print(f"Query returned {len(data)} records")
    print("=" * 60)
    
    return {
        "data": data,
        "total": total
    }
import frappe
import json

@frappe.whitelist()
def get_companies(from_date=None, to_date=None, filters=None):
    """
    Company listing API with optional inline filters support.
    If no filters provided, returns all records.
    """
    
    # Debug logging
    print("=" * 60)
    print("get_companies called")
    print(f"from_date: {from_date}")
    print(f"to_date: {to_date}")
    print(f"filters (raw): {filters}")
    print(f"filters type: {type(filters)}")
    print("=" * 60)
    
    # Parse filters from JSON string
    parsed_filters = {}
    if filters:
        if isinstance(filters, str):
            try:
                parsed_filters = json.loads(filters)
            except:
                parsed_filters = {}
        elif isinstance(filters, dict):
            parsed_filters = filters
    
    print(f"Parsed filters: {parsed_filters}")
    
    # Build WHERE conditions
    conditions = []
    values = {}
    
    # Date filters
    if from_date:
        conditions.append("creation >= %(from_date)s")
        values["from_date"] = from_date
    
    if to_date:
        conditions.append("creation <= %(to_date)s")
        values["to_date"] = to_date
    
    # ============================================
    # INLINE FILTER MAPPING
    # Frontend Column Name -> Database Field
    # ============================================
    
    filter_mapping = {
        "Company": "customer_name",
        "Client Type": "custom_client_type",
        "Industry": "custom_industry",
        "Location": ["custom_city", "custom_state"],  # Special: multiple fields
        "Billing Email": "custom_billing_email",
        "Billing Phone": "custom_billing_phone",
        "Status": "custom_client_status",
        "Fee Value": "custom_standard_fee_value",
        "Replacement": "custom_replacement_policy_"
    }
    
    for col_name, db_field in filter_mapping.items():
        if parsed_filters.get(col_name):
            filter_value = parsed_filters[col_name]
            
            # Special handling for Location (searches both city and state)
            if col_name == "Location" and isinstance(db_field, list):
                location_conditions = []
                for field in db_field:
                    location_conditions.append(f"{field} LIKE %({field})s")
                    values[field] = f"%{filter_value}%"
                conditions.append(f"({' OR '.join(location_conditions)})")
            
            # Special handling for Fee Value (remove % sign if present)
            elif col_name == "Fee Value":
                fee_val = str(filter_value).replace("%", "").strip()
                if fee_val:
                    conditions.append(f"{db_field} LIKE %(fee_value)s")
                    values["fee_value"] = f"%{fee_val}%"
            
            # Standard LIKE search for other fields
            else:
                param_name = db_field.replace("custom_", "").replace("customer_", "")
                conditions.append(f"{db_field} LIKE %({param_name})s")
                values[param_name] = f"%{filter_value}%"
    
    # Build WHERE clause
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    print(f"WHERE clause: {where_clause}")
    print(f"Values: {values}")
    
    # Execute query
    query = f"""
        SELECT 
            name,
            customer_name,
            custom_client_type,
            custom_industry,
            custom_state,
            custom_city,
            custom_billing_email,
            custom_billing_phone,
            custom_client_status,
            custom_replacement_policy_,
            custom_standard_fee_value,
            creation
        FROM `tabCustomer`
        WHERE {where_clause}
        ORDER BY creation DESC
    """
    
    data = frappe.db.sql(query, values, as_dict=True)
    
    print(f"Query returned {len(data)} records")
    print("=" * 60)
    
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
