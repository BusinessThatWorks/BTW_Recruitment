# btw_recruitment/btw_recruitment/page/master_report/master_report.py

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, getdate, nowdate


@frappe.whitelist()
def get_dashboard_kpis(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get KPI summary for dashboard"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status)

	# Get all job openings with filters
	jobs = get_filtered_jobs(filters)
	all_job_names = [j.name for j in jobs]

	# Filter only OPEN jobs
	open_jobs_list = [j for j in jobs if j.status == "Open"]
	open_job_names = [j.name for j in open_jobs_list]

	if not all_job_names:
		return {
			# ALL Jobs KPIs
			"total_joined": 0,
			"total_joined_left": 0,
			"conversion_rate": 0,
			# OPEN Jobs KPIs
			"open_jobs": 0,
			"total_submitted": 0,
			"total_rejected": 0,
			"offer_pipeline": 0,
			"ageing_critical": 0,
		}

	# ═══════════════════════════════════════════════════════════════
	# ALL JOBS KPIs (Historical Data)
	# ═══════════════════════════════════════════════════════════════

	all_interview_data = frappe.db.sql(
		"""
        SELECT
            SUM(CASE WHEN stage = 'Joined' THEN 1 ELSE 0 END) as joined,
            SUM(CASE WHEN stage = 'Joined And Left' THEN 1 ELSE 0 END) as joined_left
        FROM `tabDKP_Interview`
        WHERE job_opening IN %(job_names)s
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)[0]

	all_submitted_data = frappe.db.sql(
		"""
        SELECT COUNT(*) as total
        FROM `tabDKP_JobApplication_Child`
        WHERE parent IN %(job_names)s
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)[0]

	total_joined = cint(all_interview_data.get("joined", 0))
	total_joined_left = cint(all_interview_data.get("joined_left", 0))
	all_submitted = cint(all_submitted_data.get("total", 0))

	# Conversion rate
	conversion_rate = 0
	if all_submitted > 0:
		conversion_rate = round((total_joined / all_submitted) * 100, 1)

	# ═══════════════════════════════════════════════════════════════
	# OPEN JOBS KPIs
	# ═══════════════════════════════════════════════════════════════

	open_jobs = len(open_jobs_list)

	# Default values if no open jobs
	total_submitted = 0
	total_rejected = 0
	offer_pipeline = 0
	ageing_critical = 0
	interview_scheduled = 0

	if open_job_names:
		# Get candidate stats for OPEN jobs only
		submitted_data = frappe.db.sql(
			"""
            SELECT
                COUNT(*) as total_submitted,
                SUM(CASE WHEN stage = 'Client Screening Rejected' THEN 1 ELSE 0 END) as child_rejected
            FROM `tabDKP_JobApplication_Child`
            WHERE parent IN %(job_names)s
            """,
			{"job_names": open_job_names},
			as_dict=True,
		)[0]

		# Get interview stats for OPEN jobs only
		interview_data = frappe.db.sql(
			"""
            SELECT
                SUM(CASE WHEN stage = 'Rejected By Client' THEN 1 ELSE 0 END) as interview_rejected,
                SUM(CASE WHEN stage IN ('Selected For Offer', 'Offered', 'Offer Accepted') THEN 1 ELSE 0 END) as offer_pipeline
            FROM `tabDKP_Interview`
            WHERE job_opening IN %(job_names)s
            """,
			{"job_names": open_job_names},
			as_dict=True,
		)[0]

		interview_scheduled_data = frappe.db.sql(
			"""
            SELECT COUNT(*) as total
            FROM `tabDKP_Interview`
            WHERE job_opening IN %(job_names)s
            AND stage = 'Interview Scheduled'
            """,
			{"job_names": open_job_names},
			as_dict=True,
		)[0]

		total_submitted = cint(submitted_data.get("total_submitted", 0))
		total_rejected = cint(submitted_data.get("child_rejected", 0)) + cint(
			interview_data.get("interview_rejected", 0)
		)
		offer_pipeline = cint(interview_data.get("offer_pipeline", 0))

		# Ageing critical (Open jobs > 30 days)
		for job in open_jobs_list:
			days = date_diff(nowdate(), job.creation)
			if days > 30:
				ageing_critical += 1

		interview_scheduled = cint(interview_scheduled_data.get("total", 0))

	return {
		# ALL Jobs KPIs
		"total_joined": total_joined,
		"total_joined_left": total_joined_left,
		"conversion_rate": conversion_rate,
		# OPEN Jobs KPIs
		"open_jobs": open_jobs,
		"total_submitted": total_submitted,
		"offer_pipeline": offer_pipeline,
		"interview_scheduled": interview_scheduled,
		"ageing_critical": ageing_critical,
		# 🔥 ADD THIS
		"all_job_names": all_job_names,
		"open_job_names": open_job_names,
		"total_rejected": total_rejected,
		"screening_rejected": cint(submitted_data.get("child_rejected", 0)) if open_job_names else 0,
		"interview_rejected": cint(interview_data.get("interview_rejected", 0)) if open_job_names else 0,
	}


@frappe.whitelist()
def get_open_jobs_detail(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get open jobs detail for dialog"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status)
	jobs = get_filtered_jobs(filters)

	# Status filter dialog ke liye
	# Agar status filter hai toh wahi dikhao, warna sirf Open
	if status:
		filtered_jobs = [j for j in jobs if j.status == status]
	else:
		filtered_jobs = [j for j in jobs if j.status == "Open"]

	if not filtered_jobs:
		return []

	job_names = [j.name for j in filtered_jobs]

	# Recruiters fetch karo - child table se
	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiter string
	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Final data prepare karo
	today = frappe.utils.nowdate()
	result = []

	for job in filtered_jobs:
		days_open = frappe.utils.date_diff(today, job.creation)
		result.append(
			{
				"job_opening": job.name,
				"company_name": job.company_name,
				"designation": job.designation,
				"status": job.status,
				"recruiters": recruiter_map.get(job.name, "—"),
				"days_open": days_open,
				"priority": job.priority or "—",
			}
		)

	# Sort by days_open descending (purane pehle)
	result.sort(key=lambda x: x["days_open"], reverse=True)

	return result


# 	return data
@frappe.whitelist()
def get_submitted_candidates_detail(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get detailed submitted candidates for dialog"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status="Open")
	jobs = get_filtered_jobs(filters)
	open_job_names = [j.name for j in jobs if j.status == "Open"]

	if not open_job_names:
		return []

	# Step 1: Job wise recruiter fetch karo
	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiter string
	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Step 2: Candidates data fetch karo
	data = frappe.db.sql(
		"""
        SELECT
            child.name as child_id,
            child.parent as job_opening,
            child.candidate_name as candidate,
            child.stage as mapping_stage,
            child.remarks as recruiter_remarks,
            job.designation,
            job.company_name,
            COALESCE(interview.stage, '') as interview_stage,
            interview.name as interview_id
        FROM `tabDKP_JobApplication_Child` child
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = child.parent
        LEFT JOIN `tabDKP_Interview` interview
            ON interview.job_opening = child.parent
            AND interview.candidate_name = child.candidate_name
        WHERE child.parent IN %(job_names)s
        ORDER BY job.company_name, child.parent, child.candidate_name
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Step 3: Har row mein assigned recruiters inject karo
	for row in data:
		row["recruiter"] = recruiter_map.get(row["job_opening"], "—")

	return data


# backend
@frappe.whitelist()
def get_interview_pipeline_detail(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get interview pipeline candidates scoped to dashboard filters"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status="Open")
	jobs = get_filtered_jobs(filters)
	open_job_names = [j.name for j in jobs if j.status == "Open"]

	if not open_job_names:
		return []

	# Step 1: Job wise recruiter fetch karo
	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiter string
	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Step 2: Interview pipeline data fetch karo
	data = frappe.db.sql(
		"""
        SELECT
            i.name as interview_id,
            i.candidate_name as candidate,
            i.job_opening,
            i.stage as interview_stage,
            i.joining_date,
            i.offered_amount,
            job.designation,
            job.company_name
        FROM `tabDKP_Interview` i
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        AND i.stage IN (
            'Selected For Offer',
            'Offered',
            'Offer Accepted'
        )
        ORDER BY job.company_name, i.stage
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Step 3: Har row mein assigned recruiters inject karo
	for row in data:
		row["recruiter"] = recruiter_map.get(row["job_opening"], "—")

	return data


@frappe.whitelist()
def get_interview_scheduled_detail(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get candidates with Interview Scheduled stage for open jobs"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status="Open")
	jobs = get_filtered_jobs(filters)
	open_job_names = [j.name for j in jobs if j.status == "Open"]

	if not open_job_names:
		return []

	# Job wise assigned recruiters
	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": open_job_names},
		as_dict=True,
	)

	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Interview Scheduled data
	data = frappe.db.sql(
		"""
        SELECT
            i.name as interview_id,
            i.candidate_name as candidate,
            i.job_opening,
            i.stage,
            i.added_by as recruiter_added,
            job.designation,
            job.company_name,
            i.creation
        FROM `tabDKP_Interview` i
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        AND i.stage = 'Interview Scheduled'
        ORDER BY job.company_name, i.creation DESC
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	for row in data:
		row["recruiter"] = recruiter_map.get(row["job_opening"], "—")
		row["creation"] = (
			frappe.utils.formatdate(row.get("creation"), "dd-MM-yyyy") if row.get("creation") else "—"
		)

	return data


@frappe.whitelist()
def get_joined_detail(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get joined candidates detail for dialog"""

	# status bhi pass karo - KPI ke saath match karega
	filters = build_job_filters(from_date, to_date, company, recruiter, status)
	jobs = get_filtered_jobs(filters)
	all_job_names = [j.name for j in jobs]

	if not all_job_names:
		return []

	# Step 1: Job wise assigned recruiters fetch karo
	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": all_job_names},
		as_dict=True,
	)

	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Step 2: Joined candidates fetch karo
	data = frappe.db.sql(
		"""
        SELECT
            i.name as interview_id,
            i.candidate_name as candidate,
            i.job_opening,
            i.stage,
            i.joining_date,
            i.offered_amount,
            job.company_name,
            job.designation
        FROM `tabDKP_Interview` i
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        AND i.stage = 'Joined'
        ORDER BY i.joining_date DESC
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	for row in data:
		row["recruiter"] = recruiter_map.get(row["job_opening"], "—")

	return data


@frappe.whitelist()
def get_joined_left_detail(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get joined and left candidates detail for dialog"""

	# status bhi pass karo
	filters = build_job_filters(from_date, to_date, company, recruiter, status)
	jobs = get_filtered_jobs(filters)
	all_job_names = [j.name for j in jobs]

	if not all_job_names:
		return []

	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": all_job_names},
		as_dict=True,
	)

	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Step 2: Joined and left candidates fetch karo
	data = frappe.db.sql(
		"""
        SELECT
            i.name as interview_id,
            i.candidate_name as candidate,
            i.job_opening,
            i.stage,
            i.joining_date,
            i.candidate_left_date,
            i.days_before_left,
            i.within_replacement_policy,
            i.offered_amount,
            job.company_name,
            job.designation
        FROM `tabDKP_Interview` i
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        AND i.stage = 'Joined And Left'
        ORDER BY i.candidate_left_date DESC
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	for row in data:
		row["recruiter"] = recruiter_map.get(row["job_opening"], "—")

	return data


@frappe.whitelist()
def get_rejected_detail(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get rejected candidates detail for dialog - both sources"""

	filters = build_job_filters(from_date, to_date, company, recruiter)
	jobs = get_filtered_jobs(filters)
	open_job_names = [j.name for j in jobs if j.status == "Open"]

	if not open_job_names:
		return []

	recruiters_data = frappe.db.sql(
		"""
		SELECT
			name,
			recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": open_job_names},
		as_dict=True,
	)

	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}

	# Source 1: Rejected By Client - DKP_Interview table se
	interview_rejected = frappe.db.sql(
		"""
        SELECT
            i.name as interview_id,
            i.candidate_name as candidate,
            i.job_opening,
            job.company_name,
            job.designation,
            'Rejected By Client' as rejection_source,
            'Interview' as source_type
        FROM `tabDKP_Interview` i
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        AND i.stage = 'Rejected By Client'
        ORDER BY job.company_name, i.candidate_name
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Source 2: Client Screening Rejected - DKP_JobApplication_Child se
	screening_rejected = frappe.db.sql(
		"""
        SELECT
            child.name as interview_id,
            child.candidate_name as candidate,
            child.parent as job_opening,
            job.company_name,
            job.designation,
            'Client Screening Rejected' as rejection_source,
            'Screening' as source_type
        FROM `tabDKP_JobApplication_Child` child
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = child.parent
        WHERE child.parent IN %(job_names)s
        AND child.stage = 'Client Screening Rejected'
        ORDER BY job.company_name, child.candidate_name
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Dono combine karo
	all_rejected = list(interview_rejected) + list(screening_rejected)

	# Har row mein job opening ke assigned recruiters inject karo
	for row in all_rejected:
		row["recruiter"] = recruiter_map.get(row["job_opening"], "—")

	# Sort by company_name
	all_rejected.sort(key=lambda x: (x.get("company_name") or "", x.get("candidate") or ""))

	return all_rejected


@frappe.whitelist()
def get_ageing_critical_detail(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get ageing critical jobs detail for dialog - Open jobs older than 30 days"""

	filters = build_job_filters(from_date, to_date, company, recruiter)
	jobs = get_filtered_jobs(filters)
	open_jobs = [j for j in jobs if j.status == "Open"]

	if not open_jobs:
		return []

	today = frappe.utils.nowdate()
	critical_jobs = []

	for job in open_jobs:
		days_open = frappe.utils.date_diff(today, job.creation)
		if days_open > 30:
			critical_jobs.append(job)

	if not critical_jobs:
		return []

	critical_job_names = [j.name for j in critical_jobs]

	recruiters_data = frappe.db.sql(
		"""
		SELECT name, recruiter
		FROM `tabDKP_Job_Opening`
		WHERE name IN %(job_names)s
		""",
		{"job_names": critical_job_names},
		as_dict=True,
	)

	recruiter_map = {r.name: (r.recruiter or "—") for r in recruiters_data}
	result = []
	for job in critical_jobs:
		days_open = frappe.utils.date_diff(today, job.creation)
		result.append(
			{
				"job_opening": job.name,
				"company_name": job.company_name,
				"designation": job.designation,
				"status": job.status,
				"recruiters": recruiter_map.get(job.name, "—"),
				"days_open": days_open,
				"priority": job.priority or "—",
				"creation": str(job.creation)[:10],
			}
		)

	# Sort by days_open descending - sabse purana pehle
	result.sort(key=lambda x: x["days_open"], reverse=True)

	return result


@frappe.whitelist()
def get_master_report(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get master report data"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status)
	jobs = get_filtered_jobs(filters)

	result = []

	for job in jobs:
		# Get candidate counts from child table
		child_stats = frappe.db.sql(
			"""
            SELECT
                COUNT(*) as submitted,
                SUM(CASE WHEN stage = 'Client Screening Rejected' THEN 1 ELSE 0 END) as child_rejected
            FROM `tabDKP_JobApplication_Child`
            WHERE parent = %(job_name)s
        """,
			{"job_name": job.name},
			as_dict=True,
		)[0]

		# Get interview stats
		interview_stats = frappe.db.sql(
			"""
            SELECT
                SUM(CASE WHEN stage = 'Rejected By Client' THEN 1 ELSE 0 END) as interview_rejected,
                SUM(CASE WHEN stage IN ('Selected For Offer', 'Offered', 'Offer Accepted', 'Interview No Show')
                    AND stage NOT IN ('Rejected By Client', 'Offer Declined', 'Joined', 'Joined And Left')
                    THEN 1 ELSE 0 END) as interview_pipeline,
                SUM(CASE WHEN stage = 'Joined' THEN 1 ELSE 0 END) as joined,
                SUM(CASE WHEN stage = 'Joined And Left' THEN 1 ELSE 0 END) as replaced
            FROM `tabDKP_Interview`
            WHERE job_opening = %(job_name)s
        """,
			{"job_name": job.name},
			as_dict=True,
		)[0]

		recruiter_names = job.recruiter or "-"

		# Calculate ageing
		ageing_days = date_diff(nowdate(), job.creation)

		result.append(
			{
				"job_opening": job.name,
				"company_name": job.company_name,
				"designation": job.designation,
				"positions": cint(job.number_of_positions),
				"submitted": cint(child_stats.get("submitted", 0)),
				"rejected": cint(child_stats.get("child_rejected", 0))
				+ cint(interview_stats.get("interview_rejected", 0)),
				"interview_pipeline": cint(interview_stats.get("interview_pipeline", 0)),
				"joined": cint(interview_stats.get("joined", 0)),
				"replaced": cint(interview_stats.get("replaced", 0)),
				"ageing_days": ageing_days,
				"recruiters": recruiter_names,
				"status": job.status,
				"priority": job.priority,
			}
		)

	return result


# 	return result
@frappe.whitelist()
def get_company_summary(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get company-wise summary"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status)
	jobs = get_filtered_jobs(filters)

	if not jobs:
		return []

	all_job_names = [j.name for j in jobs]

	# Company wise job info
	company_data = {}
	for job in jobs:
		company_name = job.company_name
		if company_name not in company_data:
			company_data[company_name] = {
				"company_name": company_name,
				"open_jobs": 0,
				"total_positions": 0,
				"submitted": 0,
				"rejected": 0,
				"interview_pipeline": 0,
				"joined": 0,
				"replaced": 0,
				"recruiter_set": set(),  # recruiters collect karenge
			}
		if job.status == "Open":
			company_data[company_name]["open_jobs"] += 1

		company_data[company_name]["total_positions"] += cint(job.number_of_positions)

	# Recruiters fetch karo - company wise
	# recruiters_data = frappe.db.sql(
	# 	"""
	#     SELECT
	#         job.company_name,
	#         rec.recruiter_name
	#     FROM `tabDKP_JobOpeningRecruiter_Child` rec
	#     LEFT JOIN `tabDKP_Job_Opening` job
	#         ON job.name = rec.parent
	#     WHERE rec.parent IN %(job_names)s
	#     AND rec.recruiter_name IS NOT NULL
	#     GROUP BY job.company_name, rec.recruiter_name
	#     """,
	# 	{"job_names": all_job_names},
	# 	as_dict=True,
	# )

	# # Recruiters company wise inject karo
	# for row in recruiters_data:
	# 	company_name = row.company_name
	# 	if company_name in company_data:
	# 		company_data[company_name]["recruiter_set"].add(row.recruiter_name)
	for job in jobs:
		if job.recruiter and job.company_name in company_data:
			company_data[job.company_name]["recruiter_set"].add(job.recruiter)

	# Single query - child stats company wise
	child_stats = frappe.db.sql(
		"""
        SELECT
            job.company_name,
            COUNT(*) as submitted,
            SUM(CASE WHEN child.stage = 'Client Screening Rejected'
                THEN 1 ELSE 0 END) as child_rejected
        FROM `tabDKP_JobApplication_Child` child
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = child.parent
        WHERE child.parent IN %(job_names)s
        GROUP BY job.company_name
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Single query - interview stats company wise
	interview_stats = frappe.db.sql(
		"""
        SELECT
            job.company_name,
            SUM(CASE WHEN i.stage = 'Rejected By Client'
                THEN 1 ELSE 0 END) as interview_rejected,
            SUM(CASE WHEN i.stage IN ('Selected For Offer', 'Offered', 'Offer Accepted')
                THEN 1 ELSE 0 END) as pipeline,
            SUM(CASE WHEN i.stage = 'Joined'
                THEN 1 ELSE 0 END) as joined,
            SUM(CASE WHEN i.stage = 'Joined And Left'
                THEN 1 ELSE 0 END) as replaced
        FROM `tabDKP_Interview` i
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        GROUP BY job.company_name
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Stats inject karo
	for row in child_stats:
		company_name = row.company_name
		if company_name in company_data:
			company_data[company_name]["submitted"] += cint(row.submitted)
			company_data[company_name]["rejected"] += cint(row.child_rejected)

	for row in interview_stats:
		company_name = row.company_name
		if company_name in company_data:
			company_data[company_name]["rejected"] += cint(row.interview_rejected)
			company_data[company_name]["interview_pipeline"] += cint(row.pipeline)
			company_data[company_name]["joined"] += cint(row.joined)
			company_data[company_name]["replaced"] += cint(row.replaced)

	# Final result
	result = []
	for _company_name, data in company_data.items():
		conversion = 0
		if data["submitted"] > 0:
			conversion = round((data["joined"] / data["submitted"]) * 100, 1)
		data["conversion_rate"] = conversion

		# Set → String
		data["recruiters"] = ", ".join(sorted(data["recruiter_set"])) or "—"
		del data["recruiter_set"]  # set delete karo before return

		result.append(data)

	# Sort by open jobs desc
	result.sort(key=lambda x: x["open_jobs"], reverse=True)

	return result


@frappe.whitelist()
def get_recruiter_performance(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Get recruiter-wise performance"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status)
	jobs = get_filtered_jobs(filters)

	if not jobs:
		return []

	all_job_names = [j.name for j in jobs]

	# Step 1: Recruiter wise jobs count karo
	# recruiter_jobs = frappe.db.sql(
	# 	"""
	#     SELECT
	#         rec.recruiter_name,
	#         COUNT(DISTINCT rec.parent) as jobs_assigned
	#     FROM `tabDKP_JobOpeningRecruiter_Child` rec
	#     WHERE rec.parent IN %(job_names)s
	#     AND rec.recruiter_name IS NOT NULL
	#     GROUP BY rec.recruiter_name
	#     """,
	# 	{"job_names": all_job_names},
	# 	as_dict=True,
	# )
	# Step 1: Recruiter wise jobs count
	recruiter_jobs = frappe.db.sql(
		"""
		SELECT
			jo.recruiter as recruiter_name,
			COUNT(DISTINCT jo.name) as jobs_assigned
		FROM `tabDKP_Job_Opening` jo
		WHERE jo.name IN %(job_names)s
		AND jo.recruiter IS NOT NULL
		GROUP BY jo.recruiter
		""",
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Recruiter data dict banao
	recruiter_data = {}
	for row in recruiter_jobs:
		rec_name = row.recruiter_name
		recruiter_data[rec_name] = {
			"recruiter_name": rec_name,
			"jobs_assigned": cint(row.jobs_assigned),
			"submitted": 0,
			"rejected": 0,
			"interview_pipeline": 0,
			"joined": 0,
		}

	# Step 2: Child stats - recruiter wise
	# child_stats = frappe.db.sql(
	# 	"""
	#     SELECT
	#         rec.recruiter_name,
	#         COUNT(*) as submitted,
	#         SUM(CASE WHEN child.stage = 'Client Screening Rejected'
	#             THEN 1 ELSE 0 END) as child_rejected
	#     FROM `tabDKP_JobApplication_Child` child
	#     INNER JOIN `tabDKP_JobOpeningRecruiter_Child` rec
	#         ON rec.parent = child.parent
	#     WHERE child.parent IN %(job_names)s
	#     AND rec.recruiter_name IS NOT NULL
	#     GROUP BY rec.recruiter_name
	#     """,
	# 	{"job_names": all_job_names},
	# 	as_dict=True,
	# )
	child_stats = frappe.db.sql(
		"""
		SELECT
			jo.recruiter as recruiter_name,
			COUNT(*) as submitted,
			SUM(CASE WHEN child.stage = 'Client Screening Rejected'
				THEN 1 ELSE 0 END) as child_rejected
		FROM `tabDKP_JobApplication_Child` child
		INNER JOIN `tabDKP_Job_Opening` jo
			ON jo.name = child.parent
		WHERE child.parent IN %(job_names)s
		AND jo.recruiter IS NOT NULL
		GROUP BY jo.recruiter
		""",
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Step 3: Interview stats - recruiter wise
	# interview_stats = frappe.db.sql(
	# 	"""
	#     SELECT
	#         rec.recruiter_name,
	#         SUM(CASE WHEN i.stage = 'Rejected By Client'
	#             THEN 1 ELSE 0 END) as interview_rejected,
	#         SUM(CASE WHEN i.stage IN ('Selected For Offer', 'Offered', 'Offer Accepted')
	#             THEN 1 ELSE 0 END) as pipeline,
	#         SUM(CASE WHEN i.stage = 'Joined'
	#             THEN 1 ELSE 0 END) as joined
	#     FROM `tabDKP_Interview` i
	#     INNER JOIN `tabDKP_JobOpeningRecruiter_Child` rec
	#         ON rec.parent = i.job_opening
	#     WHERE i.job_opening IN %(job_names)s
	#     AND rec.recruiter_name IS NOT NULL
	#     GROUP BY rec.recruiter_name
	#     """,
	# 	{"job_names": all_job_names},
	# 	as_dict=True,
	# )
	interview_stats = frappe.db.sql(
		"""
		SELECT
			jo.recruiter as recruiter_name,
			SUM(CASE WHEN i.stage = 'Rejected By Client'
				THEN 1 ELSE 0 END) as interview_rejected,
			SUM(CASE WHEN i.stage IN ('Selected For Offer', 'Offered', 'Offer Accepted')
				THEN 1 ELSE 0 END) as pipeline,
			SUM(CASE WHEN i.stage = 'Joined'
				THEN 1 ELSE 0 END) as joined
		FROM `tabDKP_Interview` i
		INNER JOIN `tabDKP_Job_Opening` jo
			ON jo.name = i.job_opening
		WHERE i.job_opening IN %(job_names)s
		AND jo.recruiter IS NOT NULL
		GROUP BY jo.recruiter
		""",
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Stats inject karo
	for row in child_stats:
		rec_name = row.recruiter_name
		if rec_name in recruiter_data:
			recruiter_data[rec_name]["submitted"] += cint(row.submitted)
			recruiter_data[rec_name]["rejected"] += cint(row.child_rejected)

	for row in interview_stats:
		rec_name = row.recruiter_name
		if rec_name in recruiter_data:
			recruiter_data[rec_name]["rejected"] += cint(row.interview_rejected)
			recruiter_data[rec_name]["interview_pipeline"] += cint(row.pipeline)
			recruiter_data[rec_name]["joined"] += cint(row.joined)

	# Conversion calculate karo
	result = []
	for _rec_name, data in recruiter_data.items():
		conversion = 0
		if data["submitted"] > 0:
			conversion = round((data["joined"] / data["submitted"]) * 100, 1)
		data["conversion_rate"] = conversion
		result.append(data)

	# Sort by joined desc
	result.sort(key=lambda x: x["joined"], reverse=True)

	return result


@frappe.whitelist()
def get_ageing_analysis(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get ageing analysis data - On Hold jobs only, any priority"""

	# ✅ CHANGED: "Open" → "On Hold"
	filters = build_job_filters(from_date, to_date, company, recruiter, "On Hold")
	jobs = get_filtered_jobs(filters)

	bucket_0_15 = 0
	bucket_16_30 = 0
	bucket_30_plus = 0
	on_hold_jobs = []

	# Collect all job names for batch queries
	all_job_names = [j.name for j in jobs]

	# ── Batch fetch: submitted counts ──
	submitted_map = {}
	if all_job_names:
		submitted_data = frappe.db.sql(
			"""
			SELECT
				parent,
				COUNT(*) as submitted
			FROM `tabDKP_JobApplication_Child`
			WHERE parent IN %(job_names)s
			GROUP BY parent
			""",
			{"job_names": all_job_names},
			as_dict=True,
		)
		submitted_map = {r.parent: cint(r.submitted) for r in submitted_data}

	# ── Batch fetch: interview pipeline counts ──
	pipeline_map = {}
	if all_job_names:
		pipeline_data = frappe.db.sql(
			"""
			SELECT
				job_opening,
				SUM(CASE WHEN stage IN ('Selected For Offer', 'Offered', 'Offer Accepted')
					THEN 1 ELSE 0 END) as pipeline
			FROM `tabDKP_Interview`
			WHERE job_opening IN %(job_names)s
			GROUP BY job_opening
			""",
			{"job_names": all_job_names},
			as_dict=True,
		)
		pipeline_map = {r.job_opening: cint(r.pipeline) for r in pipeline_data}

	# ── Batch fetch: recruiters ──
	recruiter_map = {}
	if all_job_names:
		# recruiters_data = frappe.db.sql(
		# 	"""
		# 	SELECT
		# 		parent,
		# 		GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
		# 	FROM `tabDKP_JobOpeningRecruiter_Child`
		# 	WHERE parent IN %(job_names)s
		# 	GROUP BY parent
		# 	""",
		# 	{"job_names": all_job_names},
		# 	as_dict=True,
		# )
		# recruiter_map = {r.parent: r.recruiters for r in recruiters_data}
		recruiter_map = {j.name: (j.recruiter or "—") for j in jobs}

	# ── Batch fetch: last mail date from child table ──
	last_mail_map = {}
	if all_job_names:
		last_mail_data = frappe.db.sql(
			"""
			SELECT
				parent,
				MAX(sent_on) as last_sent
			FROM `tabDKP_Ageing_Mail_Log`
			WHERE parent IN %(job_names)s
			GROUP BY parent
			""",
			{"job_names": all_job_names},
			as_dict=True,
		)
		last_mail_map = {r.parent: r.last_sent for r in last_mail_data}

	# ── Process each job ──
	for job in jobs:
		ageing_days = date_diff(nowdate(), job.creation)

		if ageing_days <= 15:
			bucket_0_15 += 1
		elif ageing_days <= 30:
			bucket_16_30 += 1
		else:
			bucket_30_plus += 1

		# ✅ ALL On Hold jobs go into the table (not just 30+)
		on_hold_jobs.append(
			{
				"job_opening": job.name,
				"company_name": job.company_name,
				"designation": job.designation,
				"location": job.location or "",
				"ageing_days": ageing_days,
				"submitted": submitted_map.get(job.name, 0),
				"interview_pipeline": pipeline_map.get(job.name, 0),
				"status": job.status,
				"priority": job.priority or "—",
				"recruiters": recruiter_map.get(job.name, "—"),
				"last_followup_status": job.last_followup_status or "—",
				"last_followup_date": str(last_mail_map.get(job.name, ""))
				if last_mail_map.get(job.name)
				else "—",
			}
		)

	# Sort by ageing desc — sabse purana pehle
	on_hold_jobs.sort(key=lambda x: x["ageing_days"], reverse=True)

	return {
		"bucket_0_15": bucket_0_15,
		"bucket_16_30": bucket_16_30,
		"bucket_30_plus": bucket_30_plus,
		"on_hold_jobs": on_hold_jobs,
	}


# ═══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════


def build_job_filters(from_date=None, to_date=None, company=None, recruiter=None, status=None):
	"""Build filters dict for job opening query"""
	filters = {}

	if company:
		filters["company_name"] = company

	if status:
		filters["status"] = status

	return {"filters": filters, "from_date": from_date, "to_date": to_date, "recruiter": recruiter}


def get_filtered_jobs(filter_dict):
	"""Get filtered job openings"""

	filters = filter_dict.get("filters", {})
	from_date = filter_dict.get("from_date")
	to_date = filter_dict.get("to_date")
	recruiter = filter_dict.get("recruiter")

	# Build SQL conditions
	conditions = ["1=1"]
	values = {}

	if filters.get("company_name"):
		conditions.append("jo.company_name = %(company_name)s")
		values["company_name"] = filters["company_name"]

	if filters.get("status"):
		conditions.append("jo.status = %(status)s")
		values["status"] = filters["status"]

	if from_date:
		conditions.append("jo.creation >= %(from_date)s")
		values["from_date"] = from_date

	if to_date:
		conditions.append("jo.creation < %(to_date)s")
		values["to_date"] = add_days(to_date, 1)

	# ✅ FIXED: Changed 'recruiter' to 'recruiter_name' in JOIN
	if recruiter:
		conditions.append("jo.recruiter = %(recruiter)s")
		values["recruiter"] = recruiter

	sql = f"""
        SELECT DISTINCT
            jo.name,
            jo.company_name,
            jo.designation,
            jo.number_of_positions,
            jo.status,
            jo.priority,
            jo.creation,
            jo.replacement_used,
			jo.last_followup_status,
			jo.last_followup_date,
			jo.location,
			jo.recruiter
        FROM `tabDKP_Job_Opening` jo
		WHERE {" AND ".join(conditions)}
        ORDER BY jo.creation DESC
    """

	return frappe.db.sql(sql, values, as_dict=True)


# 	return templates
@frappe.whitelist()
def get_mail_templates():
	"""Return template options for on-hold job emails"""

	templates = [
		{
			"id": "no_update",
			"label": "No Update from Client",
			"status_value": "No Update from Client Sent",
			"subject": "Dua's Knowledge Potli: Update on Requirement Status \u2013 Pending Feedback",
			"description": "Use when there has been no update from the client and requirement status needs confirmation.",
		},
		{
			"id": "nearby_profiles",
			"label": "Nearby Profile Suggestion",
			"status_value": "Nearby Profiles Alignment Sent",
			"subject": "Dua's Knowledge Potli: Alignment on Candidate Profiles \u2013 {designation}",
			"description": "Use when exact matching profiles are limited and nearby profiles need client approval.",
		},
		{
			"id": "compensation_alignment",
			"label": "Compensation Alignment",
			"status_value": "Compensation Alignment Sent",
			"subject": "Dua's Knowledge Potli: Discussion on Compensation Alignment \u2013 {designation}",
			"description": "Use when the market compensation is higher than the current approved budget.",
		},
	]

	return templates


@frappe.whitelist()
def send_bulk_followup(job_names=None, template_type=None):
	"""Send bulk on-hold job emails for selected jobs"""

	import json

	if isinstance(job_names, str):
		job_names = json.loads(job_names)

	if not job_names or not template_type:
		frappe.throw(_("Please select jobs and a template type"))

	templates = {
		"No Update from Client Sent": {
			"subject": "Dua's Knowledge Potli: Update on Requirement Status \u2013 Pending Feedback",
			"body": """
	<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
		<p>Dear {hiring_manager_name},</p>

		<p>I hope you are doing well.</p>

		<p>We would like to check in regarding the status of the requirement for <strong>{designation}</strong>, for which several profiles were shared earlier. As the requirement has now been open for over <strong>{ageing_days} days</strong>, and we have not received further feedback or follow-ups on the resumes shared, we wanted to confirm the current status from your end.</p>

		<p>In case the requirement is <strong>no longer active or has been put on hold</strong>, please let us know so that we may consider the position <strong>closed from our end</strong>.</p>

		<p>If the requirement is still active, we would be happy to continue supporting the hiring process and align on the next steps.</p>

		<p>Looking forward to your guidance.</p>

		<div style="margin-top: 24px;">
			<p style="margin-bottom: 4px;">Warm regards,</p>
			<p style="margin: 0; font-weight: 600;">{sender_name}</p>
			<p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px;">{sender_email}</p>
		</div>
	</div>
	""",
		},
		"Nearby Profiles Alignment Sent": {
			"subject": "Dua's Knowledge Potli: Alignment on Candidate Profiles \u2013 {designation}",
			"body": """
	<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
		<p>Dear {hiring_manager_name},</p>

		<p>With reference to the <strong>{designation}</strong> requirement, we wanted to share a quick update.</p>

		<p>Over the past few weeks, we have been actively exploring relevant profiles in the market. However, candidates who match the <strong>exact combination of skills and experience</strong> as outlined in the requirement appear to be limited at the moment.</p>

		<p>In view of this, we wanted to check if we could <strong>expand the search scope slightly and consider nearby profiles</strong>, who may not match the requirement 100% but <strong>have closely relevant experience and the potential to fit the role with minimal ramp-up time</strong>.</p>

		<p>Your guidance on this will help us broaden the search and move the hiring process forward more effectively.</p>

		<p>Looking forward to your thoughts.</p>

		<div style="margin-top: 24px;">
			<p style="margin-bottom: 4px;">Warm regards,</p>
			<p style="margin: 0; font-weight: 600;">{sender_name}</p>
			<p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px;">{sender_email}</p>
		</div>
	</div>
	""",
		},
		"Compensation Alignment Sent": {
			"subject": "Dua's Knowledge Potli: Discussion on Compensation Alignment \u2013 {designation}",
			"body": """
	<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
		<p>Dear {hiring_manager_name},</p>

		<p>We wanted to share a quick update regarding the <strong>{designation}</strong> requirement.</p>

		<p>While exploring the candidate market for this role, we have observed that <strong>most suitable candidates fall within a compensation range higher than the currently proposed budget</strong>. As a result, it has been challenging to identify profiles that match the role requirements within the current salary bracket.</p>

		<p>We would request your guidance on whether there is <strong>any flexibility in the compensation range</strong>, or if we should explore <strong>candidates with slightly different experience levels</strong> who may fit within the current budget.</p>

		<p>Your inputs will help us align the search strategy and move the hiring process forward more effectively.</p>

		<p>Looking forward to your guidance.</p>

		<div style="margin-top: 24px;">
			<p style="margin-bottom: 4px;">Warm regards,</p>
			<p style="margin: 0; font-weight: 600;">{sender_name}</p>
			<p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px;">{sender_email}</p>
		</div>
	</div>
	""",
		},
	}

	if template_type not in templates:
		frappe.throw(_("Invalid template type: {0}").format(template_type))

	template = templates[template_type]
	results = {"success": [], "failed": []}
	sender_name = frappe.utils.get_fullname(frappe.session.user)
	sender_email = frappe.session.user

	for job_name in job_names:
		try:
			job = frappe.get_doc("DKP_Job_Opening", job_name)
			ageing_days = date_diff(nowdate(), job.creation)

			# To emails
			recipient_emails = get_customer_emails(job.company_name)

			if not recipient_emails:
				results["failed"].append(
					{"job": job_name, "reason": f"No contact emails found for {job.company_name}"}
				)
				continue

			# CC emails
			cc_emails = get_recruiter_emails(job_name)

			# Greeting name fallback order:
			# Contact name -> Address title -> Email
			hiring_manager_name = get_hiring_manager_name(
				customer_name=job.company_name,
				recipient_emails=recipient_emails,
			)

			subject_format_data = {
				"designation": job.designation or "",
			}

			body_format_data = {
				"hiring_manager_name": frappe.utils.escape_html(hiring_manager_name or ""),
				"designation": frappe.utils.escape_html(job.designation or ""),
				"ageing_days": ageing_days,
				"sender_name": frappe.utils.escape_html(sender_name or ""),
				"sender_email": frappe.utils.escape_html(sender_email or ""),
			}

			subject = template["subject"].format(**subject_format_data)
			body = template["body"].format(**body_format_data)

			frappe.sendmail(
				recipients=recipient_emails,
				cc=cc_emails if cc_emails else None,
				subject=subject,
				message=body,
				reference_doctype="DKP_Job_Opening",
				reference_name=job_name,
				expose_recipients="header",
				now=True,
			)

			job.append(
				"ageing_mail_log",
				{
					"sent_on": frappe.utils.now_datetime(),
					"template_type": template_type,
					"sent_by": frappe.session.user,
					"recipient": ", ".join(recipient_emails),
					"cc": ", ".join(cc_emails) if cc_emails else "",
				},
			)

			job.last_followup_status = template_type
			job.last_followup_date = frappe.utils.now_datetime()
			job.flags.ignore_permissions = True
			job.flags.ignore_mandatory = True
			job.save()

			results["success"].append(
				{
					"job": job_name,
					"company": job.company_name,
					"recipients": ", ".join(recipient_emails),
				}
			)

		except Exception as e:
			results["failed"].append({"job": job_name, "reason": str(e)})
			frappe.log_error(
				title=f"On Hold Job Email Failed: {job_name}",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
	return results


def get_hiring_manager_name(customer_name, recipient_emails=None):
	"""Return contact name, else address title, else first email"""

	if not customer_name:
		return recipient_emails[0] if recipient_emails else "Hiring Manager"

	email_fallbacks = []

	# 1) Contact name
	contact_rows = frappe.db.sql(
		"""
		SELECT
			c.first_name,
			c.middle_name,
			c.last_name,
			c.email_id,
			c.user,
			c.is_primary_contact
		FROM `tabContact` c
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = c.name
			AND dl.parenttype = 'Contact'
		WHERE dl.link_doctype = 'Customer'
		  AND dl.link_name = %(customer_name)s
		ORDER BY c.is_primary_contact DESC, c.modified DESC
		""",
		{"customer_name": customer_name},
		as_dict=True,
	)

	for row in contact_rows:
		full_name = " ".join(
			[
				part.strip()
				for part in [row.first_name, row.middle_name, row.last_name]
				if part and str(part).strip()
			]
		)
		if full_name:
			return full_name

		if row.email_id and row.email_id.strip():
			email_fallbacks.append(row.email_id.strip())

		if row.user and row.user.strip():
			email_fallbacks.append(row.user.strip())

	# 2) Address title
	address_rows = frappe.db.sql(
		"""
		SELECT
			a.address_title,
			a.email_id,
			a.is_primary_address
		FROM `tabAddress` a
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = a.name
			AND dl.parenttype = 'Address'
		WHERE dl.link_doctype = 'Customer'
		  AND dl.link_name = %(customer_name)s
		ORDER BY a.is_primary_address DESC, a.modified DESC
		""",
		{"customer_name": customer_name},
		as_dict=True,
	)

	for row in address_rows:
		if row.address_title and row.address_title.strip():
			return row.address_title.strip()

		if row.email_id and row.email_id.strip():
			email_fallbacks.append(row.email_id.strip())

	# 3) Email fallback
	if recipient_emails:
		for email in recipient_emails:
			if email and email.strip():
				return email.strip()

	for email in email_fallbacks:
		if email and email.strip():
			return email.strip()

	return "Hiring Manager"


def get_customer_emails(customer_name):
	"""Get all contact/address email IDs linked to a Customer"""

	if not customer_name:
		return []

	emails = set()

	# ── Source 1: Contact → email_id (primary email field) ──
	contact_emails = frappe.db.sql(
		"""
		SELECT
			c.email_id
		FROM `tabContact` c
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = c.name
			AND dl.parenttype = 'Contact'
		WHERE dl.link_doctype = 'Customer'
		AND dl.link_name = %(customer_name)s
		AND c.email_id IS NOT NULL
		AND c.email_id != ''
		""",
		{"customer_name": customer_name},
		as_list=True,
	)
	for e in contact_emails:
		if e[0]:
			emails.add(e[0].strip())

	# ── Source 2: Contact → email_ids child table ──
	contact_child_emails = frappe.db.sql(
		"""
		SELECT
			ce.email_id
		FROM `tabContact Email` ce
		INNER JOIN `tabContact` c
			ON c.name = ce.parent
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = c.name
			AND dl.parenttype = 'Contact'
		WHERE dl.link_doctype = 'Customer'
		AND dl.link_name = %(customer_name)s
		AND ce.email_id IS NOT NULL
		AND ce.email_id != ''
		""",
		{"customer_name": customer_name},
		as_list=True,
	)
	for e in contact_child_emails:
		if e[0]:
			emails.add(e[0].strip())

	# ── Source 3: Contact → user field (linked User's email) ──
	contact_users = frappe.db.sql(
		"""
		SELECT
			c.user
		FROM `tabContact` c
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = c.name
			AND dl.parenttype = 'Contact'
		WHERE dl.link_doctype = 'Customer'
		AND dl.link_name = %(customer_name)s
		AND c.user IS NOT NULL
		AND c.user != ''
		""",
		{"customer_name": customer_name},
		as_list=True,
	)
	for e in contact_users:
		if e[0]:
			emails.add(e[0].strip())

	# ── Source 4: Address → email_id ──
	address_emails = frappe.db.sql(
		"""
		SELECT
			a.email_id
		FROM `tabAddress` a
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = a.name
			AND dl.parenttype = 'Address'
		WHERE dl.link_doctype = 'Customer'
		AND dl.link_name = %(customer_name)s
		AND a.email_id IS NOT NULL
		AND a.email_id != ''
		""",
		{"customer_name": customer_name},
		as_list=True,
	)
	for e in address_emails:
		if e[0]:
			emails.add(e[0].strip())

	return sorted(emails)


def get_recruiter_emails(job_name):
	"""Get email IDs of assigned recruiters for a job opening"""

	if not job_name:
		return []

	# recruiter_name is Link to User, so value = User.name
	recruiter_users = frappe.db.get_all(
		"DKP_JobOpeningRecruiter_Child",
		filters={"parent": job_name},
		pluck="recruiter_name",
	)

	if not recruiter_users:
		return []

	# remove blanks + duplicates
	recruiter_users = list(dict.fromkeys([u.strip() for u in recruiter_users if u]))

	# fetch only enabled users
	enabled_users = frappe.db.get_all(
		"User",
		filters={
			"name": ["in", recruiter_users],
			"enabled": 1,
		},
		pluck="name",
	)

	# In Frappe, User.name is generally the email id
	cc_emails = [u for u in enabled_users if u and "@" in u]

	return list(dict.fromkeys(cc_emails))
