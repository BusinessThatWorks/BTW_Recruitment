# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document



class DKP_Job_Application(Document):
	pass

import frappe
from datetime import datetime, timedelta

@frappe.whitelist()
def get_candidate_status(candidate):
    out = {
        "blacklisted": False,
        "cooling": False,
        "remaining_days": 0,
        "no_poach": False,
        "no_poach_company": ""
    }

    # ---------------- BLACKLIST CHECK ----------------
    is_blacklisted = frappe.db.get_value(
        "DKP_Candidate", candidate, "blacklisted"
    )

    if is_blacklisted:
        out["blacklisted"] = True
        return out   # HARD STOP

    # # ---------------- COOLING PERIOD CHECK ----------------
    # last_rejected = frappe.db.sql("""
    #     SELECT parent.modified
    #     FROM `tabDKP_JobApplication_Child` child
    #     JOIN `tabDKP_Job_Application` parent
    #         ON child.parent = parent.name
    #     WHERE child.candidate_name = %s
    #       AND child.stage = 'Rejected'
    #     ORDER BY parent.modified DESC
    #     LIMIT 1
    # """, (candidate,), as_dict=True)

    # if last_rejected:
    #     last_date = last_rejected[0].modified
    #     cooling_period = timedelta(days=180)
    #     remaining = (last_date + cooling_period) - datetime.now()

    #     if remaining.total_seconds() > 0:
    #         out["cooling"] = True
    #         out["remaining_days"] = remaining.days
    #         return out   # HARD STOP

    # ---------------- NO POACH CHECK ----------------
    current_company = frappe.db.get_value(
        "DKP_Candidate", candidate, "current_company_master"
    )

    if current_company:
        no_poach = frappe.db.get_value(
            "DKP_Company", current_company, "no_poach_flag"
        )

        if no_poach:
            out["no_poach"] = True
            out["no_poach_company"] = current_company
            return out   # HARD STOP

    return out

@frappe.whitelist()
def get_open_job_openings(company_name=None):
    """
    API endpoint to get job openings filtered by company and status
    Called from JavaScript when company is selected
    """
    filters = {'status': 'Open'}
    
    if company_name:
        filters['company'] = company_name
    
    open_jobs = frappe.get_list(
        'DKP_Job_Opening',
        filters=filters,
        fields=['name', 'designation', 'company', 'status'],
        order_by='name asc'
    )
    
    # Format response for Select field - use name only (value and label both are name)
    job_options = [{'value': job.name, 'label': job.name} for job in open_jobs]
    
    return {
        'success': True,
        'data': job_options,
        'count': len(job_options)
    }

@frappe.whitelist()
def get_matching_candidates(job_opening_name=None, existing_candidates=None):
    """
    Get candidate suggestions based on job opening criteria matching.
    Matches candidates on: designation, skills, experience, location, certifications
    Uses the exact name of the job opening document.
    """
    if not job_opening_name:
        return {"success": False, "message": "Job opening name is required"}
    
    # Get job opening document directly using the exact name
    try:
        job_opening = frappe.get_doc("DKP_Job_Opening", job_opening_name)
    except frappe.DoesNotExistError:
        return {"success": False, "message": f"Job opening '{job_opening_name}' not found"}
    except Exception as e:
        return {"success": False, "message": f"Error fetching job opening: {str(e)}"}
    
    # Get already added candidates to exclude them
    # Handle existing_candidates parameter (from unsaved form or saved document)
    if existing_candidates:
        if isinstance(existing_candidates, str):
            # If it's a string, try to parse it as JSON
            try:
                existing_candidates = frappe.parse_json(existing_candidates)
            except:
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
        "max_experience": job_opening.max_experience_years or 999,
        "location": job_opening.location or "",
        "department": job_opening.department or "",
    }
    
    # Get all candidates (excluding blacklisted and already added)
    candidate_filters = {
        "blacklisted": 0
    }
    
    if existing_candidates:
        candidate_filters["name"] = ["not in", existing_candidates]
    
    all_candidates = frappe.get_all(
        "DKP_Candidate",
        filters=candidate_filters,
        fields=[
            "name", "candidate_name", "current_designation", "total_experience_years",
            "skills_tags", "primary_skill_set", "secondary_skill_set",
            "key_certifications", "current_location", "department",
            "current_ctc", "expected_ctc", "email", "mobile_number",
            "current_company_master"
        ]
    )
    
    # Score and match candidates
    matched_candidates = []
    
    for candidate in all_candidates:
        match_score = 0
        match_reasons = []
        
        # 1. Designation match (30 points)
        if criteria["designation"]:
            if candidate.current_designation:
                if criteria["designation"].lower() in candidate.current_designation.lower() or \
                   candidate.current_designation.lower() in criteria["designation"].lower():
                    match_score += 30
                    match_reasons.append("Designation match")
        
        # 2. Experience match (25 points)
        candidate_exp = candidate.total_experience_years or 0
        if criteria["min_experience"] <= candidate_exp <= criteria["max_experience"]:
            match_score += 25
            match_reasons.append("Experience within range")
        elif candidate_exp >= criteria["min_experience"]:
            match_score += 15
            match_reasons.append("Experience above minimum")
        
        # 3. Skills match (25 points)
        # Parse skills - handle comma, semicolon, or newline separated
        def parse_skills(skills_str):
            if not skills_str:
                return []
            # Split by comma, semicolon, or newline
            skills = []
            for delimiter in [',', ';', '\n']:
                if delimiter in skills_str:
                    skills = [s.strip().lower() for s in skills_str.split(delimiter) if s.strip()]
                    break
            if not skills:
                # If no delimiter, treat as single skill or space-separated
                skills = [s.strip().lower() for s in skills_str.split() if s.strip()]
            return skills
        
        must_have_skills = parse_skills(criteria["must_have_skills"])
        good_to_have_skills = parse_skills(criteria["good_to_have_skills"])
        
        # Build candidate skills string
        candidate_skills = ""
        if candidate.skills_tags:
            candidate_skills += " " + candidate.skills_tags.lower()
        if candidate.primary_skill_set:
            candidate_skills += " " + candidate.primary_skill_set.lower()
        if candidate.secondary_skill_set:
            candidate_skills += " " + candidate.secondary_skill_set.lower()
        
        # Check for skill matches (partial matching)
        must_have_matches = sum(1 for skill in must_have_skills if skill in candidate_skills)
        good_to_have_matches = sum(1 for skill in good_to_have_skills if skill in candidate_skills)
        
        if must_have_skills:
            must_have_score = (must_have_matches / len(must_have_skills)) * 20
            match_score += must_have_score
            if must_have_matches > 0:
                match_reasons.append(f"{must_have_matches}/{len(must_have_skills)} must-have skills")
        
        if good_to_have_skills:
            good_to_have_score = (good_to_have_matches / len(good_to_have_skills)) * 5
            match_score += good_to_have_score
            if good_to_have_matches > 0:
                match_reasons.append(f"{good_to_have_matches}/{len(good_to_have_skills)} good-to-have skills")
        
        # 4. Certifications match (10 points)
        if criteria["required_certifications"]:
            # Parse certifications similar to skills
            required_certs = []
            certs_str = criteria["required_certifications"]
            for delimiter in [',', ';', '\n']:
                if delimiter in certs_str:
                    required_certs = [c.strip().lower() for c in certs_str.split(delimiter) if c.strip()]
                    break
            if not required_certs:
                required_certs = [c.strip().lower() for c in certs_str.split() if c.strip()]
            
            candidate_certs = (candidate.key_certifications or "").lower()
            cert_matches = sum(1 for cert in required_certs if cert in candidate_certs)
            if cert_matches > 0:
                cert_score = (cert_matches / len(required_certs)) * 10
                match_score += cert_score
                match_reasons.append(f"{cert_matches}/{len(required_certs)} certifications")
        
        # 5. Location match (10 points)
        if criteria["location"] and candidate.current_location:
            if criteria["location"].lower() in candidate.current_location.lower() or \
               candidate.current_location.lower() in criteria["location"].lower():
                match_score += 10
                match_reasons.append("Location match")
        
        # Only include candidates with match_score > 0 (blacklisted are already filtered out)
        if match_score > 0:
            candidate["match_score"] = round(match_score, 1)
            candidate["match_reasons"] = match_reasons
            
            # Check no-poach status
            candidate["is_no_poach"] = False
            candidate["no_poach_company"] = ""
            if candidate.get("current_company_master"):
                no_poach_flag = frappe.db.get_value(
                    "DKP_Company",
                    candidate.current_company_master,
                    "no_poach_flag"
                )
                if no_poach_flag:
                    candidate["is_no_poach"] = True
                    candidate["no_poach_company"] = candidate.current_company_master
            
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
        "criteria": criteria
    }