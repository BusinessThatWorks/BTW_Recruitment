from decimal import Decimal, InvalidOperation

import frappe
from frappe.model.document import Document


class DKP_Job_Opening(Document):
	def on_update(self):
		self.send_change_notification_email()
		self.sync_candidate_openings()
		self.delete_removed_candidate_interviews()

	def validate(self):
		self.validate_removed_candidates()

	def on_trash(self):
		self.remove_from_all_candidates()

	def after_insert(self):
		self.send_new_job_opening_email()

	def send_change_notification_email(self):
		"""Send email to assigned recruiters ONLY when actual changes are made"""

		if not self.assign_recruiter:
			return

		previous_doc = self.get_doc_before_save()

		if not previous_doc:
			return

		main_changes = self.get_field_changes(previous_doc)
		candidate_changes = self.get_candidate_table_changes(previous_doc)
		recruiter_change = self.get_recruiter_changes(previous_doc)

		all_changes = main_changes.copy()
		if recruiter_change:
			all_changes.append(recruiter_change)

		if not all_changes and not candidate_changes:
			return

		recruiter_emails = [row.recruiter_name for row in self.assign_recruiter if row.recruiter_name]

		if not recruiter_emails:
			return

		subject = f"Job Opening Updated - {self.name}"

		html_content = f"""
		<p>Hello,</p>

		<p>Changes have been made to a job opening assigned to you:</p>

		<p><b>Job Opening:</b> {self.name} | <b>Company:</b> {self.company_name} | <b>Designation:</b> {self.designation}</p>
		"""

		if all_changes:
			changes_html = self.build_changes_html(all_changes)
			html_content += f"""
			<h3 style="color: #333; margin-top: 20px;">Field Changes:</h3>
			<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 700px;">
				<tr style="background-color: #4CAF50; color: white;">
					<th style="text-align: left;">Field</th>
					<th style="text-align: left;">Old Value</th>
					<th style="text-align: left;">New Value</th>
				</tr>
				{changes_html}
			</table>
			"""

		if candidate_changes:
			candidate_html = self.build_candidate_changes_html(candidate_changes)
			html_content += f"""
			<h3 style="color: #333; margin-top: 20px;">Candidate Changes:</h3>
			{candidate_html}
			"""

		html_content += """
		<br>
		<p>Regards,<br>HR Team</p>
		"""

		frappe.sendmail(
			recipients=recruiter_emails,
			subject=subject,
			message=html_content,
		)

	def get_field_changes(self, previous_doc):
		"""Compare previous and current doc, return list of actual changes"""

		fields_to_track = {
			"company_name": "Company",
			"designation": "Designation",
			"department": "Department",
			"location": "Location",
			"status": "Status",
			"number_of_positions": "Number of Positions",
			"min_ctc": "Min CTC Monthly",
			"max_ctc": "Max CTC Monthly",
			"gender_preference": "Gender Preference",
			"work_mode": "Work Mode",
			"shift": "Shift",
			"priority": "Priority",
			"travel_required": "Travel Required",
			"must_have_skills": "Must Have Skills",
			"required_qualification": "Required Qualification",
			"variableincentive": "Variable/Incentive",
			"closed_reason": "Closed Reason",
			"notes": "Additional Information",
		}

		changes = []

		for fieldname, label in fields_to_track.items():
			old_value = previous_doc.get(fieldname)
			new_value = self.get(fieldname)

			old_value = str(old_value).strip() if old_value else "-"
			new_value = str(new_value).strip() if new_value else "-"

			if old_value != new_value:
				changes.append(
					{
						"field": label,
						"old_value": old_value,
						"new_value": new_value,
					}
				)

		return changes

	def get_candidate_table_changes(self, previous_doc):
		"""Track changes in candidates_table child table"""

		changes = {"added": [], "removed": [], "modified": []}

		# ✅ Build lookup for previous candidates
		prev_candidates = {}
		if previous_doc.candidates_table:
			for row in previous_doc.candidates_table:
				if row.candidate_name:
					prev_candidates[row.candidate_name] = {
						"stage": row.stage or "-",
						"sub_stages_interview": row.sub_stages_interview or "-",
						"remarks": row.remarks or "-",
						"added_by": row.added_by or "-",
					}

		# ✅ Build lookup for current candidates
		curr_candidates = {}
		if self.candidates_table:
			for row in self.candidates_table:
				if row.candidate_name:
					curr_candidates[row.candidate_name] = {
						"stage": row.stage or "-",
						"sub_stages_interview": row.sub_stages_interview or "-",
						"remarks": row.remarks or "-",
						"added_by": row.added_by or "-",
					}

		prev_set = set(prev_candidates.keys())
		curr_set = set(curr_candidates.keys())

		# ✅ Added candidates
		for cand in curr_set - prev_set:
			cand_data = curr_candidates[cand]
			changes["added"].append(
				{"candidate": cand, "stage": cand_data["stage"], "added_by": cand_data["added_by"]}
			)

		# ✅ Removed candidates
		for cand in prev_set - curr_set:
			changes["removed"].append({"candidate": cand})

		# ✅ Modified candidates (stage/sub_stage/remarks changed)
		for cand in prev_set & curr_set:
			prev_data = prev_candidates[cand]
			curr_data = curr_candidates[cand]

			field_changes = []

			if prev_data["stage"] != curr_data["stage"]:
				field_changes.append(
					{"field": "Mapping Stage", "old": prev_data["stage"], "new": curr_data["stage"]}
				)

			if prev_data["sub_stages_interview"] != curr_data["sub_stages_interview"]:
				field_changes.append(
					{
						"field": "Interview Stage",
						"old": prev_data["sub_stages_interview"],
						"new": curr_data["sub_stages_interview"],
					}
				)

			if prev_data["remarks"] != curr_data["remarks"]:
				field_changes.append(
					{"field": "Remarks", "old": prev_data["remarks"], "new": curr_data["remarks"]}
				)

			if field_changes:
				changes["modified"].append({"candidate": cand, "changes": field_changes})

		# ✅ Return None if no changes
		if not changes["added"] and not changes["removed"] and not changes["modified"]:
			return None

		return changes

	def get_recruiter_changes(self, previous_doc):
		"""Track changes in assigned recruiters"""

		old_recruiters = set()
		new_recruiters = set()

		if previous_doc.assign_recruiter:
			old_recruiters = {r.recruiter_name for r in previous_doc.assign_recruiter if r.recruiter_name}

		if self.assign_recruiter:
			new_recruiters = {r.recruiter_name for r in self.assign_recruiter if r.recruiter_name}

		if old_recruiters == new_recruiters:
			return None

		return {
			"field": "Assigned Recruiters",
			"old_value": ", ".join(sorted(old_recruiters)) if old_recruiters else "-",
			"new_value": ", ".join(sorted(new_recruiters)) if new_recruiters else "-",
		}

	def build_changes_html(self, changes):
		"""Build HTML table rows for main field changes"""

		rows = ""
		for change in changes:
			old_val = str(change["old_value"])
			new_val = str(change["new_value"])

			# ✅ Truncate long text
			if len(old_val) > 100:
				old_val = old_val[:100] + "..."
			if len(new_val) > 100:
				new_val = new_val[:100] + "..."

			rows += f"""
            <tr>
                <td><b>{change["field"]}</b></td>
                <td style="color: #888;">{old_val}</td>
                <td style="color: #2e7d32;">{new_val}</td>
            </tr>
            """

		return rows

	def build_candidate_changes_html(self, changes):
		"""Build HTML for candidate table changes"""

		html = ""

		# ✅ Added candidates
		if changes.get("added"):
			html += """
            <h4 style="color: #2e7d32; margin-top: 15px;">✅ Candidates Added:</h4>
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr style="background-color: #e8f5e9;">
                    <th>Candidate</th>
                    <th>Stage</th>
                    <th>Added By</th>
                </tr>
            """
			for item in changes["added"]:
				html += f"""
                <tr>
                    <td>{item["candidate"]}</td>
                    <td>{item["stage"]}</td>
                    <td>{item["added_by"]}</td>
                </tr>
                """
			html += "</table>"

		# ✅ Removed candidates
		if changes.get("removed"):
			html += """
            <h4 style="color: #c62828; margin-top: 15px;">❌ Candidates Removed:</h4>
            <ul>
            """
			for item in changes["removed"]:
				html += f"<li>{item['candidate']}</li>"
			html += "</ul>"

		# ✅ Modified candidates
		if changes.get("modified"):
			html += """
            <h4 style="color: #1565c0; margin-top: 15px;">📝 Candidates Updated:</h4>
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 700px;">
                <tr style="background-color: #e3f2fd;">
                    <th>Candidate</th>
                    <th>Field</th>
                    <th>Old Value</th>
                    <th>New Value</th>
                </tr>
            """
			for item in changes["modified"]:
				candidate = item["candidate"]
				for i, change in enumerate(item["changes"]):
					html += f"""
                    <tr>
                        <td>{"" if i > 0 else candidate}</td>
                        <td>{change["field"]}</td>
                        <td style="color: #888;">{change["old"]}</td>
                        <td style="color: #2e7d32;">{change["new"]}</td>
                    </tr>
                    """
			html += "</table>"

		return html

	def send_new_job_opening_email(self):
		"""Send email when new job opening is created"""

		recruiter_emails = [row.recruiter_name for row in self.assign_recruiter if row.recruiter_name]

		if not recruiter_emails:
			return

		subject = f"🆕 New Job Opening Assigned – {self.name}"  # noqa: RUF001

		html_content = f"""
        <p>Hello,</p>

        <p>A new job opening has been assigned to you.</p>

        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
            <tr><td><b>Job Opening ID</b></td><td>{self.name}</td></tr>
            <tr><td><b>Company</b></td><td>{self.company_name}</td></tr>
            <tr><td><b>Designation</b></td><td>{self.designation}</td></tr>
            <tr><td><b>Department</b></td><td>{self.department or "-"}</td></tr>
            <tr><td><b>Location</b></td><td>{self.location or "-"}</td></tr>
            <tr><td><b>Positions</b></td><td>{self.number_of_positions or "-"}</td></tr>
            <tr><td><b>Experience</b></td><td>{self.min_experience_years or 0} - {self.max_experience_years or 0} Years</td></tr>
            <tr><td><b>CTC Range</b></td><td>₹{self.min_ctc or 0} - ₹{self.max_ctc or 0} Monthly</td></tr>
            <tr><td><b>Priority</b></td><td>{self.priority or "-"}</td></tr>
            <tr><td><b>Assigned Recruiters</b></td><td>{", ".join(recruiter_emails)}</td></tr>
        </table>

        <p>Regards,<br>HR Team</p>
        """

		frappe.sendmail(
			recipients=recruiter_emails,
			subject=subject,
			message=html_content,
		)

	def before_save(self):
		for row in self.candidates_table:
			if row.is_new() and not row.added_by:
				row.added_by = frappe.session.user

		# self.delete_interviews_for_removed_candidates()

	def sync_candidate_openings(self):
		"""
		Sync candidates tagged in this Job Opening to their respective
		DKP_Candidate.table_gcbt (Tagged Openings child table)
		"""

		job_opening_name = self.name

		# Get all candidates currently tagged in this job opening
		current_candidates = {}
		for row in self.candidates_table or []:
			if row.candidate_name:
				current_candidates[row.candidate_name] = {
					"mapping_stage": row.stage,
					"interview_stage": row.sub_stages_interview,
					"remarks": row.remarks,
					"added_by": row.added_by,
					"interview": row.interview,
				}

		current_candidate_names = list(current_candidates.keys())

		# Find candidates who were previously tagged but now removed
		previously_tagged = frappe.get_all(
			"DKP_Candidate_Openings_Child",
			filters={"job_opening": job_opening_name},
			fields=["name", "parent"],
		)

		candidates_to_update = set()

		# Remove entries for candidates no longer in this opening
		for prev in previously_tagged:
			if prev.parent not in current_candidate_names:
				frappe.delete_doc(
					"DKP_Candidate_Openings_Child", prev.name, ignore_permissions=True, force=True
				)
				candidates_to_update.add(prev.parent)

		# Update/Insert for current candidates
		for candidate_name, candidate_data in current_candidates.items():
			# Check if candidate exists
			if not frappe.db.exists("DKP_Candidate", candidate_name):
				continue

			existing_row = frappe.db.get_value(
				"DKP_Candidate_Openings_Child",
				{
					"parent": candidate_name,
					"parenttype": "DKP_Candidate",
					"parentfield": "table_gcbt",
					"job_opening": job_opening_name,
				},
				"name",
			)

			if existing_row:
				# Update existing row
				frappe.db.set_value(
					"DKP_Candidate_Openings_Child",
					existing_row,
					{
						"mapping_stage": candidate_data["mapping_stage"],
						"interview_stage": candidate_data["interview_stage"],
						"remarks": candidate_data["remarks"],
						"added_by": candidate_data["added_by"],
						"interview": candidate_data["interview"],
						"status": self.status,
						"company": self.company_name,
						"designation": self.designation,
						"location": self.location,
					},
					update_modified=False,
				)
			else:
				# Insert new row
				self.insert_candidate_opening_row(candidate_name, candidate_data)

			candidates_to_update.add(candidate_name)

		# Update modified timestamp for affected candidates
		if candidates_to_update:
			frappe.db.sql(
				"""
				UPDATE `tabDKP_Candidate`
				SET modified = %s
				WHERE name IN %s
			""",
				(frappe.utils.now(), list(candidates_to_update)),
			)

		frappe.db.commit()

	def insert_candidate_opening_row(self, candidate_name, candidate_data):
		"""Insert a new row in candidate's tagged openings table"""
		max_idx = frappe.db.sql(
			"""
			SELECT COALESCE(MAX(idx), 0)
			FROM `tabDKP_Candidate_Openings_Child`
			WHERE parent = %s AND parentfield = 'table_gcbt'
		""",
			candidate_name,
		)[0][0]

		new_row = frappe.get_doc(
			{
				"doctype": "DKP_Candidate_Openings_Child",
				"parent": candidate_name,
				"parenttype": "DKP_Candidate",
				"parentfield": "table_gcbt",
				"idx": max_idx + 1,
				"job_opening": self.name,
				"company": self.company_name,
				"designation": self.designation,
				"location": self.location,
				"status": self.status,
				"mapping_stage": candidate_data["mapping_stage"],
				"interview_stage": candidate_data["interview_stage"],
				"remarks": candidate_data["remarks"],
				"added_by": candidate_data["added_by"],
				"interview": candidate_data["interview"],
			}
		)
		new_row.db_insert()

	def remove_from_all_candidates(self):
		"""Remove this job opening from all candidates when deleted"""
		frappe.db.sql(
			"""
			DELETE FROM `tabDKP_Candidate_Openings_Child`
			WHERE job_opening = %s
		""",
			self.name,
		)
		frappe.db.commit()

	# def before_save(self):

	# def delete_interviews_for_removed_candidates(self):
	# 	"""Delete linked interviews when candidate row is removed from opening,
	# 	but block deletion if interview has a Joining Tracker linked.
	# 	"""

	# 	old_doc = self.get_doc_before_save()
	# 	if not old_doc:
	# 		return

	# 	old_rows = {
	# 		row.name: row.interview
	# 		for row in old_doc.candidates_table
	# 		if row.interview
	# 	}

	# 	current_row_names = {row.name for row in self.candidates_table}
	# 	deleted_row_names = set(old_rows.keys()) - current_row_names

	# 	# Pehle check kar lo kahin joining tracker linked to nahi
	# 	for row_name in deleted_row_names:
	# 		interview_name = old_rows[row_name]

	# 		if not interview_name or not frappe.db.exists("DKP_Interview", interview_name):
	# 			continue

	# 		candidate_name, joining_tracker = frappe.db.get_value(
	# 			"DKP_Interview",
	# 			interview_name,
	# 			["candidate_name", "invoice_ref"]
	# 		)

	# 		if joining_tracker:
	# 			frappe.throw(
	# 				f"Cannot remove candidate <b>{candidate_name or ''}</b> because "
	# 				f"Interview <b>{interview_name}</b> is linked with Joining Tracker "
	# 				f"<b>{joining_tracker}</b>.",
	# 				title="Deletion Not Allowed"
	# 			)

	# 	# Agar kahin joining tracker nahi mila, to safe delete
	# 	deleted_interviews = []

	# 	for row_name in deleted_row_names:
	# 		interview_name = old_rows[row_name]

	# 		if not interview_name or not frappe.db.exists("DKP_Interview", interview_name):
	# 			continue

	# 		try:
	# 			frappe.delete_doc(
	# 				"DKP_Interview",
	# 				interview_name,
	# 				ignore_permissions=True,
	# 				force=True,
	# 			)
	# 			deleted_interviews.append(interview_name)

	# 		except Exception as e:
	# 			frappe.log_error(
	# 				f"Failed to delete interview {interview_name}: {e}",
	# 				"Interview Delete Error"
	# 			)
	# 			frappe.msgprint(
	# 				f"Could not delete interview <b>{interview_name}</b>: {str(e)}",
	# 				alert=True
	# 			)

	# 	if deleted_interviews:
	# 		frappe.msgprint(
	# 			f"Interview deleted successfully: <b>{', '.join(deleted_interviews)}</b>",
	# 			alert=True
	# 		)

	def validate_removed_candidates(self):
		old_doc = self.get_doc_before_save()
		self.flags.interviews_to_delete = []

		if not old_doc:
			return

		old_rows = {row.name: row.interview for row in old_doc.candidates_table if row.interview}

		current_row_names = {row.name for row in self.candidates_table}
		deleted_row_names = set(old_rows.keys()) - current_row_names

		for row_name in deleted_row_names:
			interview_name = old_rows[row_name]

			if not interview_name or not frappe.db.exists("DKP_Interview", interview_name):
				continue

			candidate_name, joining_tracker = frappe.db.get_value(
				"DKP_Interview", interview_name, ["candidate_name", "invoice_ref"]
			)

			if joining_tracker:
				frappe.throw(
					f"Cannot remove candidate <b>{candidate_name or ''}</b> because "
					f"Joining Tracker <b>{joining_tracker}</b> is linked with Interview <b>{interview_name}</b>.",
					title="Deletion Not Allowed",
				)

			self.flags.interviews_to_delete.append(interview_name)

	def delete_removed_candidate_interviews(self):
		deleted_interviews = []

		for interview_name in self.flags.get("interviews_to_delete", []):
			if not frappe.db.exists("DKP_Interview", interview_name):
				continue

			try:
				frappe.delete_doc(
					"DKP_Interview",
					interview_name,
					ignore_permissions=True,
					force=True,
				)
				deleted_interviews.append(interview_name)

			except Exception as e:
				frappe.log_error(
					f"Failed to delete interview {interview_name}: {e}", "Interview Delete Error"
				)

		if deleted_interviews:
			frappe.msgprint(
				f"Interview deleted successfully: <b>{', '.join(deleted_interviews)}</b>", alert=True
			)


@frappe.whitelist()
def get_matching_candidates(job_opening_name=None, existing_candidates=None):
	"""
	Get candidate suggestions based on job opening criteria matching.
	Matches candidates on: designation, skills, experience, location, certifications.
	Uses the exact name of the job opening document.
	"""
	if not job_opening_name:
		return {"success": False, "message": "Job opening name is required"}

	# Get job opening document directly using the exact name
	try:
		job_opening = frappe.get_doc("DKP_Job_Opening", job_opening_name)
	except frappe.DoesNotExistError:
		return {"success": False, "message": f"Job opening '{job_opening_name}' not found"}
	except Exception as e:  # pragma: no cover - defensive
		return {"success": False, "message": f"Error fetching job opening: {e!s}"}

	# Get already added candidates to exclude them
	# Handle existing_candidates parameter (from unsaved form or saved document)
	if existing_candidates:
		if isinstance(existing_candidates, str):
			# If it's a string, try to parse it as JSON
			try:
				existing_candidates = frappe.parse_json(existing_candidates)
			except Exception:
				# If not JSON, treat as single value or comma-separated
				existing_candidates = [c.strip() for c in existing_candidates.split(",") if c.strip()]
		elif not isinstance(existing_candidates, list):
			existing_candidates = []
	else:
		existing_candidates = []

	# Build matching criteria from job opening
	criteria = {
		"designation": job_opening.designation,
		"must_have_skills": job_opening.must_have_skills or "",
		"good_to_have_skills": job_opening.good_to_have_skills or "",
		"required_certifications": job_opening.required_certifications or "",
		"min_experience": job_opening.min_experience_years or 0,
		"max_experience": job_opening.max_experience_years or 99,
		"location": job_opening.location or "",
		"department": job_opening.department or "",
		"gender_preference": (job_opening.gender_preference or "").strip(),
		"min_ctc": job_opening.min_ctc or "",
		"max_ctc": job_opening.max_ctc or "",
	}
	# STRICT: If both must_have_skills and designation missing in Job Opening → show nothing
	if not (criteria["must_have_skills"].strip() or (criteria["designation"] or "").strip()):
		return {
			"success": True,
			"candidates": [],
			"total_matched": 0,
			"job_opening": job_opening_name,
			"criteria": criteria,
			"message": "No candidates: Opening must have either Must Have Skills or Designation",
		}
	# Get all candidates (excluding blacklisted and already added)
	candidate_filters = {}
	or_filters = [
		["blacklisted", "=", "No"],
		["blacklisted", "=", ""],
		["blacklisted", "is", "not set"],
	]

	if existing_candidates:
		candidate_filters["name"] = ["not in", existing_candidates]

	all_candidates = frappe.get_all(
		"DKP_Candidate",
		filters=candidate_filters,
		or_filters=or_filters,
		fields=[
			"name",
			"candidate_name",
			"current_designation",
			"total_experience_years",
			"skills_tags",
			"key_certifications",
			"current_location",
			"department",
			"current_ctc_monthly as current_ctc",
			"expected_ctc_monthly as expected_ctc",
			"email",
			"mobile_number",
			"current_company_master",
			"gender",
			"age",
		],
	)

	# Score and match candidates
	matched_candidates = []

	for candidate in all_candidates:
		# We'll keep per-category scores with explicit weights so that
		# skills can be prioritized over other criteria.
		category_scores: list[float] = []
		category_weights: list[float] = []
		match_reasons: list[str] = []
		matched_skill_names: list[str] = []

		designation_matched = False

		if criteria["designation"]:
			if candidate.current_designation:
				if (
					criteria["designation"].lower() in candidate.current_designation.lower()
					or candidate.current_designation.lower() in criteria["designation"].lower()
				):
					designation_matched = True
					category_scores.append(1.0)
					category_weights.append(1.0)
					match_reasons.append("Designation match")
				else:
					category_scores.append(0.0)
					category_weights.append(1.0)
			else:
				category_scores.append(0.0)
				category_weights.append(1.0)
				match_reasons.append("Designation missing")

		def parse_skills(skills_str):
			if not skills_str:
				return []
			# Split by comma, semicolon, or newline
			for delimiter in [",", ";", "\n"]:
				if delimiter in skills_str:
					return [s.strip().lower() for s in skills_str.split(delimiter) if s.strip()]
			# If no delimiter, treat as single skill or space-separated
			return [s.strip().lower() for s in skills_str.split() if s.strip()]

		must_have_skills = parse_skills(criteria["must_have_skills"])

		# Build candidate skills string using only skills_tags
		candidate_skills = (candidate.skills_tags or "").lower()

		# Check for skill matches (partial matching) only against must-have skills
		matched_skill_names = [skill for skill in must_have_skills if skill and skill in candidate_skills]
		skills_matched = False

		must_have_matches = len(matched_skill_names)

		# If there are must-have skills defined on the opening, we will
		# ONLY consider candidates that match at least one of them.
		# This makes skills the primary eligibility gate.
		skill_score = None
		if must_have_skills:
			if must_have_matches == 0:
				# No overlap with must-have skills → exclude this candidate
				continue
			skills_matched = True

			skill_score = min(1.0, must_have_matches / len(must_have_skills))

			# Equal weight: match % is (sum of category scores) / (number of criteria) * 100
			category_scores.append(skill_score)
			category_weights.append(1.0)

			match_reasons.append(f"{must_have_matches}/{len(must_have_skills)} must-have skills")
		# STRICT: Candidate must match either skills OR designation
		if not (skills_matched or designation_matched):
			continue

		# 2. Experience match (only when job has a meaningful range, else it dilutes the score)
		min_exp = criteria["min_experience"]
		max_exp = criteria["max_experience"]
		experience_is_relevant = min_exp > 0 or max_exp < 99
		if experience_is_relevant:
			candidate_exp = candidate.total_experience_years or 0
			if min_exp <= candidate_exp <= max_exp:
				category_scores.append(1.0)
				category_weights.append(1.0)
				match_reasons.append("Experience within range")
			elif candidate_exp >= min_exp:
				category_scores.append(0.5)
				category_weights.append(1.0)
				match_reasons.append("Experience above minimum")
			else:
				category_scores.append(0.0)
				category_weights.append(1.0)
		# 4. Certifications match
		# 4. Certifications match
		if criteria["required_certifications"]:
			certs_str = criteria["required_certifications"]
			required_certs = []

			for delimiter in [",", ";", "\n"]:
				if delimiter in certs_str:
					required_certs = [c.strip().lower() for c in certs_str.split(delimiter) if c.strip()]
					break

			if not required_certs:
				required_certs = [c.strip().lower() for c in certs_str.split() if c.strip()]

			candidate_certs = (candidate.key_certifications or "").lower().strip()

			if not candidate_certs:
				# candidate missing certifications => penalty only once
				category_scores.append(0.0)
				category_weights.append(1.0)
				match_reasons.append("Certifications missing")
			else:
				cert_matches = sum(1 for cert in required_certs if cert and cert in candidate_certs)

				if cert_matches > 0:
					cert_score = min(1.0, cert_matches / len(required_certs))
					category_scores.append(cert_score)
					category_weights.append(1.0)
					match_reasons.append(f"{cert_matches}/{len(required_certs)} certifications")
				else:
					category_scores.append(0.0)
					category_weights.append(1.0)

		if criteria["location"]:
			if candidate.current_location:
				if (
					criteria["location"].lower() in candidate.current_location.lower()
					or candidate.current_location.lower() in criteria["location"].lower()
				):
					category_scores.append(1.0)
					category_weights.append(1.0)
					match_reasons.append("Location match")
				else:
					category_scores.append(0.0)
					category_weights.append(1.0)
			else:
				category_scores.append(0.0)
				category_weights.append(1.0)
				match_reasons.append("Location missing")

		# 6. Gender match
		gender_pref = criteria.get("gender_preference")
		cand_gender = (candidate.gender or "").strip()
		if gender_pref and gender_pref not in ("NA", "Any"):
			if cand_gender and cand_gender == gender_pref:
				category_scores.append(1.0)
				category_weights.append(1.0)
				match_reasons.append(f"Gender match ({cand_gender})")
			else:
				category_scores.append(0.0)
				category_weights.append(1.0)

		# 7. CTC match (using expected_ctc if available, else current_ctc)
		def parse_number(raw):
			if not raw:
				return None
			try:
				# Remove non-numeric except dot
				import re

				cleaned = re.sub(r"[^0-9.]", "", str(raw))
				return float(cleaned) if cleaned else None
			except Exception:
				return None

		min_ctc = parse_number(criteria.get("min_ctc"))
		max_ctc = parse_number(criteria.get("max_ctc"))
		cand_ctc = parse_number(candidate.expected_ctc or candidate.current_ctc)

		if cand_ctc is not None and (min_ctc is not None or max_ctc is not None):
			if cand_ctc is None:
				category_scores.append(0.0)
				category_weights.append(1.0)
				match_reasons.append("CTC missing")
			in_range = True
			if min_ctc is not None and cand_ctc < min_ctc:
				in_range = False
			if max_ctc is not None and cand_ctc > max_ctc:
				in_range = False
			if in_range:
				category_scores.append(1.0)
				category_weights.append(1.0)
				match_reasons.append("CTC within range")
			else:
				category_scores.append(0.0)
				category_weights.append(1.0)

		# Compute final score as weighted average of category scores
		# (skills have higher weight via category_weights).
		valid_pairs = [
			(score, weight)
			for score, weight in zip(category_scores, category_weights, strict=False)
			if score is not None and weight is not None
		]

		if not valid_pairs:
			continue

		total_weight = sum(w for _, w in valid_pairs)
		weighted_sum = sum(s * w for s, w in valid_pairs)
		match_score = (weighted_sum / total_weight) * 100.0

		# Only include candidates with match_score > 0 (blacklisted are already filtered out)
		if match_score > 0:
			candidate["match_score"] = round(match_score, 1)
			candidate["match_reasons"] = match_reasons
			candidate["matched_skills"] = [s.strip().title() for s in matched_skill_names]

			# Check no-poach status (Customer custom field)
			company_row = None
			if candidate.current_company_master:
				company_row = frappe.db.get_value(
					"Customer",
					candidate.current_company_master,
					["custom_no_poach_flag", "customer_name"],
					as_dict=True,
				)
			no_poach_flag = (company_row or {}).get("custom_no_poach_flag")
			customer_label = (
				(company_row or {}).get("customer_name") or candidate.current_company_master or ""
			)

			if no_poach_flag == "Yes":
				candidate["is_no_poach"] = True
				candidate["no_poach_company"] = customer_label
			else:
				candidate["is_no_poach"] = False
				candidate["no_poach_company"] = ""

			matched_candidates.append(candidate)

	# Sort by match score (highest first)
	matched_candidates.sort(key=lambda x: x["match_score"], reverse=True)

	# Limit to top 20 matches
	matched_candidates = matched_candidates[:20]

	return {
		"success": True,
		"candidates": matched_candidates,
		"total_matched": len(matched_candidates),
		"job_opening": job_opening_name,
		"criteria": criteria,
	}


def get_previous_openings_days():
	"""
	Fetch number of days from singleton.
	Defaults to 7 if not set or invalid.
	"""
	try:
		days = frappe.db.get_single_value("DKP_Previous_Openings_Days", "filter_openings")

		days = int(days)
		return days if days > 0 else 7
	except Exception:
		return 7


@frappe.whitelist()
def get_candidate_previous_openings(candidate_name, current_job_opening=None):
	"""
	Get all previous job openings for a candidate with their stages.
	Excludes the current job opening if provided.
	Only returns openings from the last 7 days.
	"""
	if not candidate_name:
		return {"success": False, "message": "Candidate name is required"}

	# Calculate date 7 days ago
	from frappe.utils import add_days, now_datetime

	# seven_days_ago = add_days(now_datetime(), -7)
	days = get_previous_openings_days()
	from_date = add_days(now_datetime(), -days)

	# Query to get all job openings where this candidate was added
	# Join DKP_JobApplication_Child with DKP_Job_Opening to get opening details
	conditions = ["child.candidate_name = %s"]
	values = [candidate_name]

	if current_job_opening:
		conditions.append("jo.name != %s")
		values.append(current_job_opening)

	# Filter for openings created in the last 7 days

	# conditions.append("jo.creation >= %s")
	# values.append(from_date)
	conditions.append("child.modified >= %s")
	values.append(from_date)

	where_clause = "WHERE " + " AND ".join(conditions)

	openings = frappe.db.sql(
		f"""
        SELECT
            jo.name AS job_opening_name,
            jo.designation,
            jo.company_name,
            jo.department,
            jo.location,
            jo.status AS opening_status,
            jo.creation AS opening_created,
            jo.modified AS opening_modified,
            child.stage,
            child.remarks,
            child.modified AS stage_modified
        FROM `tabDKP_JobApplication_Child` child
        INNER JOIN `tabDKP_Job_Opening` jo
            ON jo.name = child.parent
        {where_clause}
        ORDER BY child.modified DESC
    """,
		values,
		as_dict=True,
	)

	return {
		"success": True,
		"openings": openings,
		"total": len(openings),
		"days_used": days,
	}


@frappe.whitelist()
def get_candidate_previous_openings_count(candidate_name, current_job_opening=None):
	if not candidate_name:
		return {"success": False, "count": 0}

	from frappe.utils import add_days, now_datetime

	days = get_previous_openings_days()
	from_date = add_days(now_datetime(), -days)

	conditions = ["child.candidate_name = %s"]
	values = [candidate_name]

	if current_job_opening:
		conditions.append("jo.name != %s")
		values.append(current_job_opening)

	conditions.append("child.modified >= %s")
	values.append(from_date)

	where_clause = "WHERE " + " AND ".join(conditions)

	count = frappe.db.sql(
		f"""
        SELECT COUNT(*)
        FROM `tabDKP_JobApplication_Child` child
        INNER JOIN `tabDKP_Job_Opening` jo
            ON jo.name = child.parent
        {where_clause}
    """,
		values,
	)[0][0]

	return {"success": True, "count": count, "days_used": days}
