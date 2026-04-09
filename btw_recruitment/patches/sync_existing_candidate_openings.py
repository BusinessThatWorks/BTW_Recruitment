# import frappe


# def execute():
# 	"""
# 	One-time patch to sync existing candidate openings data
# 	from DKP_Job_Opening.candidates_table to DKP_Candidate.table_gcbt
# 	"""

# 	job_openings = frappe.get_all(
# 		"DKP_Job_Opening", fields=["name", "company_name", "designation", "location", "status"]
# 	)

# 	count = 0
# 	skipped = 0

# 	for jo in job_openings:
# 		candidates = frappe.get_all(
# 			"DKP_JobApplication_Child",
# 			filters={"parent": jo.name, "parenttype": "DKP_Job_Opening"},
# 			fields=["candidate_name", "stage", "sub_stages_interview", "remarks", "added_by", "interview"],
# 		)

# 		for c in candidates:
# 			if not c.candidate_name or not frappe.db.exists("DKP_Candidate", c.candidate_name):
# 				skipped += 1
# 				continue

# 			# Check if already exists (avoid duplicates)
# 			exists = frappe.db.exists(
# 				"DKP_Candidate_Openings_Child",
# 				{"parent": c.candidate_name, "parentfield": "table_gcbt", "job_opening": jo.name},
# 			)

# 			if exists:
# 				continue

# 			max_idx = frappe.db.sql(
# 				"SELECT COALESCE(MAX(idx), 0) FROM `tabDKP_Candidate_Openings_Child` WHERE parent = %s AND parentfield = 'table_gcbt'",
# 				c.candidate_name,
# 			)[0][0]

# 			frappe.get_doc(
# 				{
# 					"doctype": "DKP_Candidate_Openings_Child",
# 					"parent": c.candidate_name,
# 					"parenttype": "DKP_Candidate",
# 					"parentfield": "table_gcbt",
# 					"idx": max_idx + 1,
# 					"job_opening": jo.name,
# 					"company": jo.company_name,
# 					"designation": jo.designation,
# 					"location": jo.location,
# 					"status": jo.status,
# 					"mapping_stage": c.stage,
# 					"interview_stage": c.sub_stages_interview,
# 					"remarks": c.remarks,
# 					"added_by": c.added_by,
# 					"interview": c.interview,
# 				}
# 			).db_insert()
# 			count += 1

# 	frappe.db.commit()


# btw_recruitment.patches.sync_existing_candidate_openings
# # //sarim-test
