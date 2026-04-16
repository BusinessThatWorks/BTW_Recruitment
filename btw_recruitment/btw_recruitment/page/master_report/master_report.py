# btw_recruitment/btw_recruitment/page/master_report/master_report.py

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, getdate, nowdate

# @frappe.whitelist()
# def get_dashboard_kpis(from_date=None, to_date=None, company=None, recruiter=None, status=None):
# 	"""Get KPI summary for dashboard"""

# 	filters = build_job_filters(from_date, to_date, company, recruiter, status)

# 	# Get all job openings with filters
# 	jobs = get_filtered_jobs(filters)
# 	job_names = [j.name for j in jobs]

# 	if not job_names:
# 		return {
# 			"open_jobs": 0,
# 			"total_submitted": 0,
# 			"total_rejected": 0,
# 			"interview_pipeline": 0,
# 			"total_joined": 0,
# 			"total_replaced": 0,
# 			"ageing_critical": 0,
# 			"conversion_rate": 0,
# 		}

# 	# Open jobs count
# 	open_jobs = len([j for j in jobs if j.status == "Open"])

# 	# Get candidate stats from child table
# 	submitted_data = frappe.db.sql(
# 		"""
#         SELECT
#             COUNT(*) as total_submitted,
#             SUM(CASE WHEN stage = 'Client Screening Rejected' THEN 1 ELSE 0 END) as child_rejected,
#             SUM(CASE WHEN stage = 'Schedule Interview' THEN 1 ELSE 0 END) as scheduled_interview
#         FROM `tabDKP_JobApplication_Child`
#         WHERE parent IN %(job_names)s
#     """,
# 		{"job_names": job_names},
# 		as_dict=True,
# 	)[0]

# 	# Get interview stats
# 	interview_data = frappe.db.sql(
# 		"""
#         SELECT
#             SUM(CASE WHEN stage = 'Rejected By Client' THEN 1 ELSE 0 END) as interview_rejected,
#             SUM(CASE WHEN stage IN ('Selected For Offer', 'Offered', 'Offer Accepted') THEN 1 ELSE 0 END) as interview_pipeline,
#             SUM(CASE WHEN stage = 'Joined' THEN 1 ELSE 0 END) as joined,
#             SUM(CASE WHEN stage = 'Joined And Left' THEN 1 ELSE 0 END) as replaced
#         FROM `tabDKP_Interview`
#         WHERE job_opening IN %(job_names)s
#     """,
# 		{"job_names": job_names},
# 		as_dict=True,
# 	)[0]

# 	total_submitted = cint(submitted_data.get("total_submitted", 0))
# 	total_rejected = cint(submitted_data.get("child_rejected", 0)) + cint(
# 		interview_data.get("interview_rejected", 0)
# 	)
# 	interview_pipeline = cint(interview_data.get("interview_pipeline", 0))
# 	total_joined = cint(interview_data.get("joined", 0))
# 	total_replaced = cint(interview_data.get("replaced", 0))

# 	# Ageing critical (Open jobs > 30 days)
# 	ageing_critical = 0
# 	for job in jobs:
# 		if job.status == "Open":
# 			days = date_diff(nowdate(), job.creation)
# 			if days > 30:
# 				ageing_critical += 1

# 	# Conversion rate
# 	conversion_rate = 0
# 	if total_submitted > 0:
# 		conversion_rate = round((total_joined / total_submitted) * 100, 1)


# 	return {
# 		"open_jobs": open_jobs,
# 		"total_submitted": total_submitted,
# 		"total_rejected": total_rejected,
# 		"interview_pipeline": interview_pipeline,
# 		"total_joined": total_joined,
# 		"total_replaced": total_replaced,
# 		"ageing_critical": ageing_critical,
# 		"conversion_rate": conversion_rate,
# 	}
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
			"interview_pipeline": 0,
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
	interview_pipeline = 0
	ageing_critical = 0

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
                SUM(CASE WHEN stage IN ('Selected For Offer', 'Offered', 'Offer Accepted') THEN 1 ELSE 0 END) as interview_pipeline
            FROM `tabDKP_Interview`
            WHERE job_opening IN %(job_names)s
            """,
			{"job_names": open_job_names},
			as_dict=True,
		)[0]

		total_submitted = cint(submitted_data.get("total_submitted", 0))
		total_rejected = cint(submitted_data.get("child_rejected", 0)) + cint(
			interview_data.get("interview_rejected", 0)
		)
		interview_pipeline = cint(interview_data.get("interview_pipeline", 0))

		# Ageing critical (Open jobs > 30 days)
		for job in open_jobs_list:
			days = date_diff(nowdate(), job.creation)
			if days > 30:
				ageing_critical += 1

	return {
		# ALL Jobs KPIs
		"total_joined": total_joined,
		"total_joined_left": total_joined_left,
		"conversion_rate": conversion_rate,
		# OPEN Jobs KPIs
		"open_jobs": open_jobs,
		"total_submitted": total_submitted,
		"interview_pipeline": interview_pipeline,
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
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiters string
	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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


# @frappe.whitelist()
# def get_submitted_candidates_detail(from_date=None, to_date=None, company=None, recruiter=None):
# 	"""Get detailed submitted candidates for dialog"""

# 	filters = build_job_filters(from_date, to_date, company, recruiter, status="Open")
# 	jobs = get_filtered_jobs(filters)
# 	open_job_names = [j.name for j in jobs if j.status == "Open"]

# 	if not open_job_names:
# 		return []

# 	data = frappe.db.sql(
# 		"""
#         SELECT
#             child.name as child_id,
#             child.parent as job_opening,
#             child.candidate_name as candidate,
#             child.stage as mapping_stage,
#             child.remarks as recruiter_remarks,
#             job.designation,
#             job.company_name,
#             COALESCE(interview.stage, '') as interview_stage,
#             interview.name as interview_id
#         FROM `tabDKP_JobApplication_Child` child
#         LEFT JOIN `tabDKP_Job_Opening` job
#             ON job.name = child.parent
#         LEFT JOIN `tabDKP_Interview` interview
#             ON interview.job_opening = child.parent
#             AND interview.candidate_name = child.candidate_name
#         WHERE child.parent IN %(job_names)s
#         ORDER BY job.company_name, child.parent, child.candidate_name
#         """,
# 		{"job_names": open_job_names},
# 		as_dict=True,
# 	)


# 	return data
@frappe.whitelist()
def get_submitted_candidates_detail(from_date=None, to_date=None, company=None, recruiter=None):
	"""Get detailed submitted candidates for dialog"""

	filters = build_job_filters(from_date, to_date, company, recruiter, status="Open")
	jobs = get_filtered_jobs(filters)
	open_job_names = [j.name for j in jobs if j.status == "Open"]

	if not open_job_names:
		return []

	# Step 1: Job wise assigned recruiters fetch karo
	recruiters_data = frappe.db.sql(
		"""
        SELECT
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiters string
	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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

	# Step 1: Job wise assigned recruiters fetch karo
	recruiters_data = frappe.db.sql(
		"""
        SELECT
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiters string
	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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

	# Step 1: Job wise assigned recruiters fetch karo
	recruiters_data = frappe.db.sql(
		"""
        SELECT
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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

	# Step 1: Job wise recruiters fetch karo
	recruiters_data = frappe.db.sql(
		"""
        SELECT
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": open_job_names},
		as_dict=True,
	)

	# Dict banao - job_name → recruiters string
	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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


# @frappe.whitelist()
# def get_ageing_critical_detail(from_date=None, to_date=None, company=None, recruiter=None):
#     """Get ageing critical jobs detail for dialog - Open jobs older than 30 days"""

#     filters = build_job_filters(from_date, to_date, company, recruiter)
#     jobs = get_filtered_jobs(filters)
#     open_jobs = [j for j in jobs if j.status == "Open"]

#     if not open_jobs:
#         return []

#     today = frappe.utils.nowdate()
#     critical_jobs = []

#     for job in open_jobs:
#         days_open = frappe.utils.date_diff(today, job.creation)
#         if days_open > 30:
#             critical_jobs.append(job)

#     if not critical_jobs:
#         return []

#     critical_job_names = [j.name for j in critical_jobs]

#     # Recruiters fetch karo
#     recruiters_data = frappe.db.sql(
#         """
#         SELECT
#             parent,
#             GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
#         FROM `tabDKP_JobOpeningRecruiter_Child`
#         WHERE parent IN %(job_names)s
#         GROUP BY parent
#         """,
#         {"job_names": critical_job_names},
#         as_dict=True,
#     )

#     recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

#     result = []
#     for job in critical_jobs:
#         days_open = frappe.utils.date_diff(today, job.creation)
#         result.append({
#             "job_opening": job.name,
#             "company_name": job.company_name,
#             "designation": job.designation,
#             "status": job.status,
#             "recruiters": recruiter_map.get(job.name, "—"),
#             "days_open": days_open,
#             "priority": job.priority or "—",
#             "creation": str(job.creation)[:10],
#         })

#     # Sort by days_open descending - sabse purana pehle
#     result.sort(key=lambda x: x["days_open"], reverse=True)

#     return result


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

	# Recruiters fetch karo
	recruiters_data = frappe.db.sql(
		"""
        SELECT
            parent,
            GROUP_CONCAT(recruiter_name SEPARATOR ', ') as recruiters
        FROM `tabDKP_JobOpeningRecruiter_Child`
        WHERE parent IN %(job_names)s
        GROUP BY parent
        """,
		{"job_names": critical_job_names},
		as_dict=True,
	)

	recruiter_map = {r.parent: r.recruiters for r in recruiters_data}

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

		# ✅ FIXED: Changed 'recruiter' to 'recruiter_name'
		recruiters = frappe.db.get_all(
			"DKP_JobOpeningRecruiter_Child", filters={"parent": job.name}, pluck="recruiter_name"
		)
		recruiter_names = ", ".join([r for r in recruiters if r]) if recruiters else "-"

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


# @frappe.whitelist()
# def get_company_summary(from_date=None, to_date=None, company=None, recruiter=None, status=None):
# 	"""Get company-wise summary"""

# 	filters = build_job_filters(from_date, to_date, company, recruiter, status)
# 	jobs = get_filtered_jobs(filters)

# 	if not jobs:
# 		return []

# 	all_job_names = [j.name for j in jobs]

# 	# Company wise job info pehle banao
# 	company_data = {}
# 	for job in jobs:
# 		company_name = job.company_name
# 		if company_name not in company_data:
# 			company_data[company_name] = {
# 				"company_name": company_name,
# 				"open_jobs": 0,
# 				"total_positions": 0,
# 				"submitted": 0,
# 				"rejected": 0,
# 				"interview_pipeline": 0,
# 				"joined": 0,
# 				"replaced": 0,
# 			}
# 		if job.status == "Open":
# 			company_data[company_name]["open_jobs"] += 1

# 		company_data[company_name]["total_positions"] += cint(job.number_of_positions)

# 	# Single query - child stats company wise
# 	child_stats = frappe.db.sql(
# 		"""
#         SELECT
#             job.company_name,
#             COUNT(*) as submitted,
#             SUM(CASE WHEN child.stage = 'Client Screening Rejected'
#                 THEN 1 ELSE 0 END) as child_rejected
#         FROM `tabDKP_JobApplication_Child` child
#         LEFT JOIN `tabDKP_Job_Opening` job
#             ON job.name = child.parent
#         WHERE child.parent IN %(job_names)s
#         GROUP BY job.company_name
#         """,
# 		{"job_names": all_job_names},
# 		as_dict=True,
# 	)

# 	# Single query - interview stats company wise
# 	interview_stats = frappe.db.sql(
# 		"""
#         SELECT
#             job.company_name,
#             SUM(CASE WHEN i.stage = 'Rejected By Client'
#                 THEN 1 ELSE 0 END) as interview_rejected,
#             SUM(CASE WHEN i.stage IN ('Selected For Offer', 'Offered', 'Offer Accepted')
#                 THEN 1 ELSE 0 END) as pipeline,
#             SUM(CASE WHEN i.stage = 'Joined'
#                 THEN 1 ELSE 0 END) as joined,
#             SUM(CASE WHEN i.stage = 'Joined And Left'
#                 THEN 1 ELSE 0 END) as replaced
#         FROM `tabDKP_Interview` i
#         LEFT JOIN `tabDKP_Job_Opening` job
#             ON job.name = i.job_opening
#         WHERE i.job_opening IN %(job_names)s
#         GROUP BY job.company_name
#         """,
# 		{"job_names": all_job_names},
# 		as_dict=True,
# 	)

# 	# Child stats inject karo
# 	for row in child_stats:
# 		company_name = row.company_name
# 		if company_name in company_data:
# 			company_data[company_name]["submitted"] += cint(row.submitted)
# 			company_data[company_name]["rejected"] += cint(row.child_rejected)

# 	# Interview stats inject karo
# 	for row in interview_stats:
# 		company_name = row.company_name
# 		if company_name in company_data:
# 			company_data[company_name]["rejected"] += cint(row.interview_rejected)
# 			company_data[company_name]["interview_pipeline"] += cint(row.pipeline)
# 			company_data[company_name]["joined"] += cint(row.joined)
# 			company_data[company_name]["replaced"] += cint(row.replaced)

# 	# Conversion rate calculate karo
# 	result = []
# 	for _company_name, data in company_data.items():
# 		conversion = 0
# 		if data["submitted"] > 0:
# 			conversion = round((data["joined"] / data["submitted"]) * 100, 1)
# 		data["conversion_rate"] = conversion
# 		result.append(data)

# 	# Sort by open jobs desc
# 	result.sort(key=lambda x: x["open_jobs"], reverse=True)


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
	recruiters_data = frappe.db.sql(
		"""
        SELECT
            job.company_name,
            rec.recruiter_name
        FROM `tabDKP_JobOpeningRecruiter_Child` rec
        LEFT JOIN `tabDKP_Job_Opening` job
            ON job.name = rec.parent
        WHERE rec.parent IN %(job_names)s
        AND rec.recruiter_name IS NOT NULL
        GROUP BY job.company_name, rec.recruiter_name
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Recruiters company wise inject karo
	for row in recruiters_data:
		company_name = row.company_name
		if company_name in company_data:
			company_data[company_name]["recruiter_set"].add(row.recruiter_name)

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
	recruiter_jobs = frappe.db.sql(
		"""
        SELECT
            rec.recruiter_name,
            COUNT(DISTINCT rec.parent) as jobs_assigned
        FROM `tabDKP_JobOpeningRecruiter_Child` rec
        WHERE rec.parent IN %(job_names)s
        AND rec.recruiter_name IS NOT NULL
        GROUP BY rec.recruiter_name
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
	child_stats = frappe.db.sql(
		"""
        SELECT
            rec.recruiter_name,
            COUNT(*) as submitted,
            SUM(CASE WHEN child.stage = 'Client Screening Rejected'
                THEN 1 ELSE 0 END) as child_rejected
        FROM `tabDKP_JobApplication_Child` child
        INNER JOIN `tabDKP_JobOpeningRecruiter_Child` rec
            ON rec.parent = child.parent
        WHERE child.parent IN %(job_names)s
        AND rec.recruiter_name IS NOT NULL
        GROUP BY rec.recruiter_name
        """,
		{"job_names": all_job_names},
		as_dict=True,
	)

	# Step 3: Interview stats - recruiter wise
	interview_stats = frappe.db.sql(
		"""
        SELECT
            rec.recruiter_name,
            SUM(CASE WHEN i.stage = 'Rejected By Client'
                THEN 1 ELSE 0 END) as interview_rejected,
            SUM(CASE WHEN i.stage IN ('Selected For Offer', 'Offered', 'Offer Accepted')
                THEN 1 ELSE 0 END) as pipeline,
            SUM(CASE WHEN i.stage = 'Joined'
                THEN 1 ELSE 0 END) as joined
        FROM `tabDKP_Interview` i
        INNER JOIN `tabDKP_JobOpeningRecruiter_Child` rec
            ON rec.parent = i.job_opening
        WHERE i.job_opening IN %(job_names)s
        AND rec.recruiter_name IS NOT NULL
        GROUP BY rec.recruiter_name
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
	"""Get ageing analysis data"""

	# Only open jobs for ageing
	filters = build_job_filters(from_date, to_date, company, recruiter, "Open")
	jobs = get_filtered_jobs(filters)

	bucket_0_15 = 0
	bucket_16_30 = 0
	bucket_30_plus = 0
	critical_jobs = []

	for job in jobs:
		ageing_days = date_diff(nowdate(), job.creation)

		if ageing_days <= 15:
			bucket_0_15 += 1
		elif ageing_days <= 30:
			bucket_16_30 += 1
		else:
			bucket_30_plus += 1

			# Get stats for critical job
			child_stats = frappe.db.sql(
				"""
                SELECT COUNT(*) as submitted
                FROM `tabDKP_JobApplication_Child`
                WHERE parent = %(job_name)s
            """,
				{"job_name": job.name},
				as_dict=True,
			)[0]

			interview_stats = frappe.db.sql(
				"""
                SELECT
                    SUM(CASE WHEN stage IN ('Selected For Offer', 'Offered', 'Offer Accepted') THEN 1 ELSE 0 END) as pipeline
                FROM `tabDKP_Interview`
                WHERE job_opening = %(job_name)s
            """,
				{"job_name": job.name},
				as_dict=True,
			)[0]

			# ✅ FIXED: Changed 'recruiter' to 'recruiter_name'
			recruiters = frappe.db.get_all(
				"DKP_JobOpeningRecruiter_Child", filters={"parent": job.name}, pluck="recruiter_name"
			)

			critical_jobs.append(
				{
					"job_opening": job.name,
					"company_name": job.company_name,
					"designation": job.designation,
					"ageing_days": ageing_days,
					"submitted": cint(child_stats.get("submitted", 0)),
					"interview_pipeline": cint(interview_stats.get("pipeline", 0)),
					"status": job.status,
					"recruiters": ", ".join([r for r in recruiters if r]) if recruiters else "-",
				}
			)

	# Sort critical jobs by ageing desc
	critical_jobs.sort(key=lambda x: x["ageing_days"], reverse=True)

	return {
		"bucket_0_15": bucket_0_15,
		"bucket_16_30": bucket_16_30,
		"bucket_30_plus": bucket_30_plus,
		"critical_jobs": critical_jobs,
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
	recruiter_join = ""
	if recruiter:
		recruiter_join = """
            INNER JOIN `tabDKP_JobOpeningRecruiter_Child` rec
            ON rec.parent = jo.name AND rec.recruiter_name = %(recruiter)s
        """
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
            jo.replacement_used
        FROM `tabDKP_Job_Opening` jo
        {recruiter_join}
        WHERE {" AND ".join(conditions)}
        ORDER BY jo.creation DESC
    """

	return frappe.db.sql(sql, values, as_dict=True)
