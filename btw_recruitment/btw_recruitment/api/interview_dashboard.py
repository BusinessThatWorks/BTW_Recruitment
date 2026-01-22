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
def get_interview_dashboard_data(from_date=None, to_date=None, limit=20, offset=0):
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


@frappe.whitelist()
def get_interview_details(from_date=None, to_date=None, limit=20, offset=0):
	"""
	Get detailed interview information with pagination:
	- Interview date, time
	- Candidate name with link
	- Job opening
	- Interview stage
	- Interviewer email
	- Feedback
	"""
	limit = int(limit)
	offset = int(offset)
	
	# Build date condition and values
	date_condition = ""
	values = []
	
	if from_date and to_date:
		date_condition = " AND ic.interview_date BETWEEN %s AND %s"
		values = [from_date, to_date]
	
	# Build base FROM and WHERE clause
	base_from_where = """
		FROM `tabDKP_Interview_Child` ic
		INNER JOIN `tabDKP_Interview` i ON i.name = ic.parent
		LEFT JOIN `tabDKP_Job_Opening` jo ON jo.name = i.job_opening
		LEFT JOIN `tabDKP_Candidate` c ON c.name = i.candidate_name
		WHERE 1=1
	"""
	
	# Get total count
	total_query = "SELECT COUNT(*) as count " + base_from_where + date_condition
	total_result = frappe.db.sql(total_query, values, as_dict=True)
	total = total_result[0].count if total_result and len(total_result) > 0 else 0
	
	# Build SELECT query with all columns
	select_query = """
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
			jo.designation,
			jo.company_name,
			c.candidate_name as candidate_display_name
	""" + base_from_where + date_condition + " ORDER BY ic.interview_date DESC, ic.from DESC LIMIT %s OFFSET %s"
	
	# Get paginated data
	values_with_pagination = values + [limit, offset]
	data = frappe.db.sql(select_query, values_with_pagination, as_dict=True)
	
	return {
		"data": data,
		"total": total
	}
