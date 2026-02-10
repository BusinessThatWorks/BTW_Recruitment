from scipy import stats
import frappe
from frappe.utils import cint

@frappe.whitelist()
def get_recruiter_kpis(recruiter: str):
    """
    Returns recruiter-level KPI totals (not paginated)

    KPIs:
    - total_openings
    - total_positions
    - total_candidates (added_by = recruiter)
    - total_joined
    """

    if not recruiter:
        return {}

    # ✅ All openings mapped to recruiter
    openings = frappe.db.sql(
        """
        SELECT DISTINCT jo.name, jo.number_of_positions
        FROM `tabDKP_Job_Opening` jo
        INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
            ON r.parent = jo.name
        WHERE r.recruiter_name = %s
        """,
        recruiter,
        as_dict=True,
    )

    if not openings:
        return {
            "total_openings": 0,
            "total_positions": 0,
            "total_candidates": 0,
            "total_joined": 0,
        }

    opening_names = [o["name"] for o in openings]

    # total_positions = sum(o.get("number_of_positions") or 0 for o in openings)
    total_positions = sum(cint(o.get("number_of_positions")) for o in openings)


    # ✅ Candidate + joined counts (only this recruiter added)
    stats = frappe.db.sql(
        """
        SELECT
            COUNT(DISTINCT candidate_name) AS total_candidates,
            SUM(
                CASE
                    WHEN sub_stages_interview = 'Joined' THEN 1
                    ELSE 0
                END
            ) AS total_joined
        FROM `tabDKP_JobApplication_Child`
        WHERE parent IN %(openings)s
          AND parenttype = 'DKP_Job_Opening'
          AND IFNULL(candidate_name, '') != ''
          AND added_by = %(recruiter)s
        """,
        {
            "openings": tuple(opening_names),
            "recruiter": recruiter,
        },
        as_dict=True,
    )[0]
    
    total_openings = len(openings)
    total_joined = stats.get("total_joined") or 0

    avg_conversion = 0
    if total_openings:
        avg_conversion = round((total_joined / total_openings) * 100, 2)

    total_candidates = stats.get("total_candidates") or 0
    total_joined = stats.get("total_joined") or 0

    candidate_join_rate = 0
    if total_candidates:
        candidate_join_rate = round((total_joined / total_candidates) * 100, 2)

    return {
        "total_openings": total_openings,
        "total_positions": total_positions,
        "total_candidates": stats.get("total_candidates") or 0,
        "total_joined": total_joined,
        "avg_conversion": avg_conversion,
        "candidate_join_rate": candidate_join_rate,
    }



@frappe.whitelist()
def get_recruiters():
    """
    Return active users who have either
    'DKP Recruiter' or 'DKP Recruiter - Exclusive' role profile.
    Used to populate the recruiter filter on the dashboard.
    """
    rows = frappe.db.sql(
        """
        SELECT
            name,
            full_name
        FROM `tabUser`
        WHERE
            enabled = 1
            AND role_profile_name IN ('DKP Recruiter', 'DKP Recruiter - Exclusive')
        ORDER BY full_name
        """,
        as_dict=True,
    )

    return rows


@frappe.whitelist()
def get_recruiter_openings(recruiter: str, limit: int = 20, offset: int = 0):
    """
    For a given recruiter (User ID), return paginated list of job openings
    where this recruiter is tagged in the Assign Recruiter child table,
    along with:

    - total_candidates: number of distinct candidates mapped in the
      Job Opening child table (DKP_JobApplication_Child)
    - joined_candidates: how many of those mapped candidates reached
      interview sub stage = "Joined"
    """
    if not recruiter:
        return {"data": [], "total": 0}

    limit = cint(limit)
    offset = cint(offset)

    # Total openings tagged to this recruiter (for pagination)
    total = frappe.db.sql(
        """
        SELECT COUNT(DISTINCT jo.name)
        FROM `tabDKP_Job_Opening` jo
        INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
            ON r.parent = jo.name
        WHERE r.recruiter_name = %s
        """,
        recruiter,
    )[0][0]

    if not total:
        return {"data": [], "total": 0}

    # Paginated list of openings for this recruiter
    openings = frappe.db.sql(
        """
        SELECT DISTINCT
            jo.name,
            jo.company_name,
            jo.designation,
            jo.status,
            jo.number_of_positions
        FROM `tabDKP_Job_Opening` jo
        INNER JOIN `tabDKP_JobOpeningRecruiter_Child` r
            ON r.parent = jo.name
        WHERE r.recruiter_name = %s
        ORDER BY jo.creation DESC
        LIMIT %s OFFSET %s
        """,
        (recruiter, limit, offset),
        as_dict=True,
    )

    opening_names = [o["name"] for o in openings]
    if not opening_names:
        return {"data": [], "total": total}

    # Per‑opening candidate and joined counts based on mapping in Job Opening
    stats_rows = frappe.db.sql(
        """
        SELECT
            parent AS job_opening,
            COUNT(DISTINCT candidate_name) AS total_candidates,
            SUM(
                CASE
                    WHEN sub_stages_interview = 'Joined' THEN 1
                    ELSE 0
                END
            ) AS joined_candidates
        FROM `tabDKP_JobApplication_Child`
        WHERE parent IN %(openings)s
        AND parenttype = 'DKP_Job_Opening'
        AND IFNULL(candidate_name, '') != ''
        AND added_by = %(recruiter)s
        GROUP BY parent
        """,
        {
            "openings": tuple(opening_names),
            "recruiter": recruiter
        },
        as_dict=True,
    )


    stats_by_opening = {row["job_opening"]: row for row in stats_rows}

    data = []
    for o in openings:
        stats = stats_by_opening.get(o["name"], {}) or {}
        total_candidates = cint(stats.get("total_candidates") or 0)
        joined_candidates = cint(stats.get("joined_candidates") or 0)

        data.append(
            {
                "job_opening": o["name"],
                "company_name": o.get("company_name"),
                "designation": o.get("designation"),
                "status": o.get("status"),
                "number_of_positions": cint(o.get("number_of_positions") or 0),
                "total_candidates": total_candidates,
                "joined_candidates": joined_candidates,
            }
        )

    return {"data": data, "total": total}

