import frappe
from frappe.utils import today, getdate, add_days


@frappe.whitelist()
def get_interview_dashboard_kpis(from_date=None, to_date=None):
	"""
	Get KPI data for interview dashboard:
	- Interviews scheduled today
	- Candidates in "Joined" substage
	"""
	today_date = today()
	
	# Build date filters for interviews
	interview_filters = []
	if from_date and to_date:
		interview_filters.append(["interview_date", "between", [from_date, to_date]])
	
	# 1. Interviews scheduled today
	interviews_today = frappe.db.sql("""
		SELECT COUNT(*) as count
		FROM `tabDKP_Interview_Child` ic
		WHERE ic.interview_date = %s
	""", (today_date,), as_dict=True)
	
	interviews_today_count = interviews_today[0].count if interviews_today and len(interviews_today) > 0 else 0
	
	joined_candidates = frappe.db.sql("""
		SELECT COUNT(DISTINCT candidate_name) AS count
		FROM `tabDKP_JobApplication_Child`
		WHERE sub_stages_interview = 'Joined'
		AND candidate_name IS NOT NULL
		AND candidate_name != ''
	""", as_dict=True)

	joined_count = joined_candidates[0].count if joined_candidates else 0


	
	joined_count = joined_candidates[0].count if joined_candidates and len(joined_candidates) > 0 else 0
	
	return {
		"interviews_scheduled_today": interviews_today_count,
		"joined_candidates": joined_count
	}


@frappe.whitelist()
def get_interview_dashboard_data(from_date=None, to_date=None,search=None, limit=20, offset=0):
	"""
	Get interview dashboard data with pagination:
	- Number of open positions
	- Number of CVs mapped (candidates added to job openings)
	- Candidates' stages breakdown
	- Number of interviews scheduled today
	- Total number of interviews
	"""
	limit = int(limit)
	offset = int(offset)

	# Build date filters for job openings
	job_filters = []
	if from_date and to_date:
		job_filters.append(["creation", "between", [from_date, add_days(to_date, 1)]])

	if search:
		search = search.strip()
		if search:
			job_filters.append(["name", "like", f"%{search}%"])	
	
	# Get total count for pagination
	total = frappe.db.count("DKP_Job_Opening", filters=job_filters)
	
	# Get paginated job openings
	job_openings = frappe.get_all(
		"DKP_Job_Opening",
		filters=job_filters,
		fields=["name", "company_name", "designation", "number_of_positions", "status", "department"],
		limit_start=offset,
		limit_page_length=limit,
		order_by="creation desc"
	)
	
	result = []
	today_date = today()
	
	for job in job_openings:
		job_name = job.name
		
		# 1. Number of open positions
		open_positions = int(job.number_of_positions or 0)
		
		# 2. Number of CVs mapped (candidates in DKP_JobApplication_Child)
		cvs_mapped = frappe.db.sql("""
			SELECT COUNT(*) as count
			FROM `tabDKP_JobApplication_Child`
			WHERE parent = %s
			AND candidate_name IS NOT NULL
			AND candidate_name != ''
		""", (job_name,), as_dict=True)[0].count

		
		# 3. Candidates' stages breakdown
		stages_data = frappe.db.sql("""
			SELECT stage, COUNT(*) as count
			FROM `tabDKP_JobApplication_Child`
			WHERE parent = %s AND stage IS NOT NULL AND stage != ''
			GROUP BY stage
		""", (job_name,), as_dict=True)
		
		# 4. Interviews scheduled today (from DKP_Interview_Child where interview_date = today)
		interviews_scheduled_today = frappe.db.sql("""
			SELECT COUNT(*) as count
			FROM `tabDKP_Interview_Child` ic
			INNER JOIN `tabDKP_Interview` i ON i.name = ic.parent
			WHERE i.job_opening = %s
			AND ic.interview_date = %s
		""", (job_name, today_date), as_dict=True)
		
		interviews_today_count = interviews_scheduled_today[0].count if interviews_scheduled_today and len(interviews_scheduled_today) > 0 else 0
		
		# 5. Total number of interviews (count of DKP_Interview_Child records for this job opening)
		total_interviews = frappe.db.sql("""
			SELECT COUNT(*) as count
			FROM `tabDKP_Interview_Child` ic
			INNER JOIN `tabDKP_Interview` i ON i.name = ic.parent
			WHERE i.job_opening = %s
		""", (job_name,), as_dict=True)
		
		total_interviews_count = total_interviews[0].count if total_interviews and len(total_interviews) > 0 else 0
		
		# 6. Joined candidates (from job opening child table where stage = 'Joined')
		joined_candidates = frappe.db.count(
			"DKP_JobApplication_Child",
			filters={
				"parent": job_name,
				"sub_stages_interview": "Joined"
			}
		)
		
		result.append({
			"job_opening": job_name,
			"company_name": job.company_name,
			"designation": job.designation,
			"department": job.department,
			"status": job.status,
			"open_positions": open_positions,
			"cvs_mapped": cvs_mapped,
			"stages": stages_data,
			"interviews_scheduled_today": interviews_today_count,
			"total_interviews": total_interviews_count,
			"joined": joined_candidates
		})
	
	return {
		"data": result,
		"total": total
	}
from datetime import datetime, time

def format_time_12h(t):
	"""
	Convert time / datetime.time / string like '15:30:25.554642' to '03:30 PM'
	"""
	if not t:
		return ""

	# If time/datetime object
	if hasattr(t, "strftime"):
		return t.strftime("%I:%M %p")

	s = str(t).strip()

	# remove microseconds
	if "." in s:
		s = s.split(".")[0]

	# handle HH:MM also
	if len(s.split(":")) == 2:
		s = s + ":00"

	try:
		dt = datetime.strptime(s, "%H:%M:%S")
		return dt.strftime("%I:%M %p")
	except Exception:
		# fallback
		return str(t)


# @frappe.whitelist()
# def get_interview_details(from_date=None, to_date=None, limit=20, offset=0):
# 	"""
# 	Get detailed interview information with pagination:
# 	- Interview date, time
# 	- Candidate name with link
# 	- Job opening
# 	- Interview stage
# 	- Interviewer email
# 	- Feedback
# 	"""
# 	limit = int(limit)
# 	offset = int(offset)
	
# 	# Build date condition and values
# 	date_condition = ""
# 	values = []
	
# 	if from_date and to_date:
# 		date_condition = " AND ic.interview_date BETWEEN %s AND %s"
# 		values = [from_date, to_date]
	
# 	# Build base FROM and WHERE clause
# 	base_from_where = """
# 		FROM `tabDKP_Interview_Child` ic
# 		INNER JOIN `tabDKP_Interview` i ON i.name = ic.parent
# 		LEFT JOIN `tabDKP_Job_Opening` jo ON jo.name = i.job_opening
# 		LEFT JOIN `tabDKP_Candidate` c ON c.name = i.candidate_name
# 		WHERE 1=1
# 	"""
	
# 	# Get total count
# 	total_query = "SELECT COUNT(*) as count " + base_from_where + date_condition
# 	total_result = frappe.db.sql(total_query, values, as_dict=True)
# 	total = total_result[0].count if total_result and len(total_result) > 0 else 0
	
# 	# Build SELECT query with all columns
# 	select_query = """
# 		SELECT 
# 			ic.name as interview_child_name,
# 			ic.interview_date,
# 			ic.from as interview_from_time,
# 			ic.to as interview_to_time,
# 			ic.interview_stage,
# 			ic.interviewer_email,
# 			ic.feedback,
# 			i.name as interview_name,
# 			i.candidate_name,
# 			i.job_opening,
# 			i.stage as interview_stage_main,
# 			i.substage,
# 			jo.designation,
# 			jo.company_name,
# 			c.candidate_name as candidate_display_name
# 	""" + base_from_where + date_condition + " ORDER BY ic.interview_date DESC, ic.from DESC LIMIT %s OFFSET %s"
	
# 	# Get paginated data
# 	values_with_pagination = values + [limit, offset]
# 	data = frappe.db.sql(select_query, values_with_pagination, as_dict=True)

# 	# ✅ Format time here (12-hour)
# 	for row in data:
# 			from_fmt = format_time_12h(row.get("interview_from_time"))
# 			to_fmt = format_time_12h(row.get("interview_to_time"))

# 			# overwrite fields so frontend stays same
# 			row["interview_from_time"] = from_fmt or ""
# 			row["interview_to_time"] = to_fmt or ""

# 			# optional: provide range directly
# 			if from_fmt and to_fmt:
# 				row["interview_time_range"] = f"{from_fmt} - {to_fmt}"
# 			else:
# 				row["interview_time_range"] = from_fmt or to_fmt or "-"
	
# 	return {
# 		"data": data,
# 		"total": total
# 	}
# @frappe.whitelist()
# def get_interview_details(from_date=None, to_date=None, search=None, limit=20, offset=0):
#     """
#     Get detailed interview information with pagination:
#     - Interview date, time
#     - Candidate name with link
#     - Job opening
#     - Job Application stage + substage
#     - Interview stage
#     - Interviewer email
#     - Feedback
#     """
#     limit = int(limit)
#     offset = int(offset)
    
#     # Build date condition
#     date_condition = ""
#     values = []
#     if from_date and to_date:
#         date_condition = " AND ic.interview_date BETWEEN %s AND %s"
#         values = [from_date, to_date]
# 	if search:
			

#     # Base FROM and JOINs
#     base_from_where = """
#         FROM `tabDKP_Interview_Child` ic
#         INNER JOIN `tabDKP_Interview` i ON i.name = ic.parent
#         LEFT JOIN `tabDKP_Job_Opening` jo ON jo.name = i.job_opening
#         LEFT JOIN `tabDKP_Candidate` c ON c.name = i.candidate_name
#         LEFT JOIN `tabDKP_JobApplication_Child` jc 
#             ON jc.parent = i.job_opening AND jc.candidate_name = i.candidate_name
#         WHERE 1=1
#     """

#     # Total count
#     total_query = "SELECT COUNT(*) as count " + base_from_where + date_condition
#     total_result = frappe.db.sql(total_query, values, as_dict=True)
#     total = total_result[0].count if total_result else 0

#     # Select query with job application stage included
#     select_query = f"""
#         SELECT 
#             ic.name as interview_child_name,
#             ic.interview_date,
#             ic.from as interview_from_time,
#             ic.to as interview_to_time,
#             ic.interview_stage,
#             ic.interviewer_email,
#             ic.feedback,
#             i.name as interview_name,
#             i.candidate_name,
#             i.job_opening,
#             i.stage as interview_stage_main,
#             i.substage,
#             jc.stage as job_application_stage,
#             jc.sub_stages_interview as job_application_substage,
#             jo.designation,
#             jo.company_name,
#             c.candidate_name as candidate_display_name
#         {base_from_where} {date_condition}
#         ORDER BY ic.interview_date DESC, ic.from DESC
#         LIMIT %s OFFSET %s
#     """

#     # Fetch data
#     values_with_pagination = values + [limit, offset]
#     data = frappe.db.sql(select_query, values_with_pagination, as_dict=True)

#     # Format time (12-hour) and add time range
#     for row in data:
#         from_fmt = format_time_12h(row.get("interview_from_time"))
#         to_fmt = format_time_12h(row.get("interview_to_time"))

#         row["interview_from_time"] = from_fmt or ""
#         row["interview_to_time"] = to_fmt or ""
#         row["interview_time_range"] = f"{from_fmt} - {to_fmt}" if from_fmt and to_fmt else from_fmt or to_fmt or "-"

#     return {
#         "data": data,
#         "total": total
#     }
import frappe

@frappe.whitelist()
def get_interview_details(from_date=None, to_date=None, search=None, limit=20, offset=0):
    """
    Get detailed interview information with pagination:
    - Interview date, time
    - Candidate name with link
    - Job opening
    - Job Application stage + substage
    - Interview stage
    - Interviewer email
    - Feedback
    Supports:
    - Date filtering (from_date, to_date)
    - Search filtering by Job Opening only
    """

    limit = int(limit)
    offset = int(offset)
    
    values = []

    # Build date condition
    date_condition = ""
    if from_date and to_date:
        date_condition = " AND ic.interview_date BETWEEN %s AND %s"
        values.extend([from_date, to_date])

    # Build search condition (Job Opening only)
    search_condition = ""
    if search:
        search_like = f"%{search}%"
        search_condition = " AND LOWER(i.job_opening) LIKE LOWER(%s)"
        values.append(search_like)

    # Base FROM and JOINs
    base_from_where = """
        FROM `tabDKP_Interview_Child` ic
        INNER JOIN `tabDKP_Interview` i ON i.name = ic.parent
        LEFT JOIN `tabDKP_Job_Opening` jo ON jo.name = i.job_opening
        LEFT JOIN `tabDKP_Candidate` c ON c.name = i.candidate_name
        LEFT JOIN `tabDKP_JobApplication_Child` jc 
            ON jc.parent = i.job_opening AND jc.candidate_name = i.candidate_name
        WHERE 1=1
    """

    # Total count query
    total_query = "SELECT COUNT(*) as count " + base_from_where + date_condition + search_condition
    total_result = frappe.db.sql(total_query, values, as_dict=True)
    total = total_result[0].count if total_result else 0

    # Select query
    select_query = f"""
        SELECT 
            ic.name as interview_child_name,
            ic.interview_date,
            ic.from as interview_from_time,
            ic.to as interview_to_time,
            ic.interview_stage,
            ic.interviewer_email,
            ic.feedback,
            i.name as interview_name,
            i.candidate_name,
            i.job_opening,
            i.stage as interview_stage_main,
            i.substage,
            jc.stage as job_application_stage,
            jc.sub_stages_interview as job_application_substage,
            jo.designation,
            jo.company_name,
            c.candidate_name as candidate_display_name
        {base_from_where} {date_condition} {search_condition}
        ORDER BY ic.interview_date DESC, ic.from DESC
        LIMIT %s OFFSET %s
    """

    # Append pagination values
    values_with_pagination = values + [limit, offset]

    # Fetch data
    data = frappe.db.sql(select_query, values_with_pagination, as_dict=True)

    # Format time (12-hour) and add time range
    for row in data:
        from_fmt = format_time_12h(row.get("interview_from_time"))
        to_fmt = format_time_12h(row.get("interview_to_time"))

        row["interview_from_time"] = from_fmt or ""
        row["interview_to_time"] = to_fmt or ""
        row["interview_time_range"] = f"{from_fmt} - {to_fmt}" if from_fmt and to_fmt else from_fmt or to_fmt or "-"

    return {
        "data": data,
        "total": total
    }


from frappe.utils.xlsxutils import make_xlsx


@frappe.whitelist()
def download_interview_dashboard(tab="summary", from_date=None, to_date=None, search=None):
	"""Download current tab data as Excel with same filters (date + search)."""
	# Form POST sends "null" / "" as strings; normalize to None so date filters don't break
	if from_date in (None, "", "null"):
		from_date = None
	if to_date in (None, "", "null"):
		to_date = None
	if search in (None, "", "null"):
		search = None
	if tab == "summary":
		res = get_interview_dashboard_data(from_date=from_date, to_date=to_date, search=search, limit=10000, offset=0)
		data = res["data"]
		headers = ["Job Opening", "Status", "Open Positions", "CVs Mapped", "Candidates' Stages", "Interviews Today", "Joined"]
		rows = [headers]
		for r in data:
			stages = r.get("stages") or []
			stages_str = ", ".join(f"{s['stage']} ({s['count']})" for s in stages) if stages else "-"
			rows.append([
				r.get("job_opening") or "",
				r.get("status") or "",
				r.get("open_positions") or 0,
				r.get("cvs_mapped") or 0,
				stages_str,
				r.get("interviews_scheduled_today") or 0,
				r.get("joined") or 0,
			])
	elif tab == "details":
		res = get_interview_details(from_date=from_date, to_date=to_date, search=search, limit=10000, offset=0)
		data = res["data"]
		headers = ["Job Opening", "Candidate", "Mapping Stage", "Interview Stage Main", "Interview Stage", "Interview Date", "Time"]
		rows = [headers]
		for r in data:
			date_str = frappe.utils.data.formatdate(r["interview_date"]) if r.get("interview_date") else "-"
			time_str = r.get("interview_time_range") or (f"{r.get('interview_from_time') or ''} - {r.get('interview_to_time') or ''}".strip(" -") or "-")
			rows.append([
				r.get("job_opening") or "",
				r.get("candidate_display_name") or r.get("candidate_name") or "",
				r.get("job_application_stage") or "",
				r.get("interview_stage_main") or "",
				r.get("interview_stage") or "",
				date_str,
				time_str,
			])
	else:
		return
	xlsx_file = make_xlsx(data=rows, sheet_name=tab.capitalize())
	frappe.local.response.filename = f"{tab}_interview_dashboard.xlsx"
	frappe.local.response.filecontent = xlsx_file.getvalue()
	frappe.local.response.type = "download"
