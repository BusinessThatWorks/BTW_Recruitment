import frappe
from frappe.model.document import Document


class DKP_Job_Opening(Document):
    def on_update(self):
        self.send_job_opening_email()

    def send_job_opening_email(self):
        if not self.assign_recruiter:
            return

        # ✅ Extract recruiter emails from child table
        recruiter_emails = [
            row.recruiter_name
            for row in self.assign_recruiter
            if row.recruiter_name
        ]

        if not recruiter_emails:
            return
        # cc_emails = ["sarimk360@gmail.com", "sharda.kumari@clapgrow.com"]
        subject = f"New Job Opening Assigned – {self.name}"

        html_content = f"""
        <p>Hello,</p>

        <p>A new job opening has been assigned to you.</p>

        <ul>
            <li><b>Job Opening ID:</b> {self.name}</li>
            <li><b>Company:</b> {self.company_name}</li>
            <li><b>Designation:</b> {self.designation}</li>
            <li><b>Department:</b> {self.department or "-"}</li>
            <li><b>Location:</b> {self.location or "-"}</li>
            <li><b>Assigned Recruiters:</b> {', '.join(recruiter_emails)}</li>
            

        </ul>

        <p>Regards,<br>HR Team</p>
        """

        frappe.sendmail(
            recipients=recruiter_emails,  # ✅ list of emails
            subject=subject,
            content=html_content,
            # cc=cc_emails,
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
        return {"success": False, "message": f"Error fetching job opening: {str(e)}"}

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

        # 1. Designation match
        # if criteria["designation"] and candidate.current_designation:
        #     if (
        #         criteria["designation"].lower() in candidate.current_designation.lower()
        #         or candidate.current_designation.lower() in criteria["designation"].lower()
        #     ):
        #         category_scores.append(1.0)
        #         category_weights.append(1.0)
        #         match_reasons.append("Designation match")
        #     else:
        #         category_scores.append(0.0)
        #         category_weights.append(1.0)
        if criteria["designation"]:
            if candidate.current_designation:
                if (
                    criteria["designation"].lower() in candidate.current_designation.lower()
                    or candidate.current_designation.lower() in criteria["designation"].lower()
                ):
                    category_scores.append(1.0)
                    category_weights.append(1.0)
                    match_reasons.append("Designation match")
                else:
                    category_scores.append(0.0)
                    category_weights.append(1.0)
            else:
                # candidate missing designation => penalty
                category_scores.append(0.0)
                category_weights.append(1.0)
                match_reasons.append("Designation missing")


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

        # 3. Skills match (PRIORITY)
        #    Matching is now based ONLY on:
        #    - Job Opening: must_have_skills
        #    - Candidate: skills_tags
        #    Other skill fields (good_to_have_skills, primary_skill_set,
        #    secondary_skill_set) are ignored for matching.
        # Parse skills - handle comma, semicolon, or newline separated
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
        must_have_matches = sum(1 for skill in must_have_skills if skill and skill in candidate_skills)

        # If there are must-have skills defined on the opening, we will
        # ONLY consider candidates that match at least one of them.
        # This makes skills the primary eligibility gate.
        skill_score = None
        if must_have_skills:
            if must_have_matches == 0:
                # No overlap with must-have skills → exclude this candidate
                continue

            skill_score = min(1.0, must_have_matches / len(must_have_skills))

            # Equal weight: match % is (sum of category scores) / (number of criteria) * 100
            category_scores.append(skill_score)
            category_weights.append(1.0)

            match_reasons.append(f"{must_have_matches}/{len(must_have_skills)} must-have skills")

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


        # 5. Location match
        # if criteria["location"] and candidate.current_location:
        #     if (
        #         criteria["location"].lower() in candidate.current_location.lower()
        #         or candidate.current_location.lower() in criteria["location"].lower()
        #     ):
        #         category_scores.append(1.0)
        #         category_weights.append(1.0)
        #         match_reasons.append("Location match")
        #     else:
        #         category_scores.append(0.0)
        #         category_weights.append(1.0)
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
            for score, weight in zip(category_scores, category_weights)
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

            # Check no-poach status
            no_poach_flag = frappe.db.get_value(
                "DKP_Company",
                candidate.current_company_master,
                "no_poach_flag"
            )

            if no_poach_flag == "Yes":
                candidate["is_no_poach"] = True
                candidate["no_poach_company"] = candidate.current_company_master
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
        days = frappe.db.get_single_value(
            "DKP_Previous_Openings_Days",
            "filter_openings"
        )

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
    conditions.append("jo.creation >= %s")
    values.append(from_date)


    where_clause = "WHERE " + " AND ".join(conditions)

    openings = frappe.db.sql(f"""
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
        ORDER BY jo.creation DESC
    """, values, as_dict=True)

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

    conditions.append("jo.creation >= %s")
    values.append(from_date)

    where_clause = "WHERE " + " AND ".join(conditions)

    count = frappe.db.sql(f"""
        SELECT COUNT(*)
        FROM `tabDKP_JobApplication_Child` child
        INNER JOIN `tabDKP_Job_Opening` jo
            ON jo.name = child.parent
        {where_clause}
    """, values)[0][0]

    return {
        "success": True,
        "count": count,
        "days_used": days
    }



