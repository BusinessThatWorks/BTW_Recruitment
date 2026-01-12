frappe.ui.form.on("DKP_Job_Opening", {
    refresh(frm) {
        frm.set_query("assign_recruiter", function () {
            return {
                filters: {
                    role_profile_name: "DKP Recruiter"
                }
            };
        });
    },

    // Button on Job Opening: Suggest Candidates
    suggest_candidates(frm) {
        show_opening_candidate_suggestions(frm);
    }
});

// --------- SUGGEST CANDIDATES FOR JOB OPENING ----------

function show_opening_candidate_suggestions(frm) {
    // Ensure Job Opening is saved (we need a proper name)
    if (frm.is_new()) {
        frappe.msgprint({
            title: "Save Required",
            message: "Please save the Job Opening before suggesting candidates.",
            indicator: "orange"
        });
        return;
    }

    const job_opening_name = frm.doc.name;

    // Get already added candidates from the candidates_table (works for both saved and unsaved rows)
    let existing_candidates = [];
    if (frm.doc.candidates_table && frm.doc.candidates_table.length > 0) {
        existing_candidates = frm.doc.candidates_table
            .filter(row => row.candidate_name)
            .map(row => row.candidate_name);
    }

    // Fetch matching candidates - use the exact name of the Job Opening
    frappe.call({
        method: "btw_recruitment.btw_recruitment.doctype.dkp_job_opening.dkp_job_opening.get_matching_candidates",
        args: {
            job_opening_name,
            existing_candidates
        },
        callback(r) {
            if (!r.message || !r.message.success) {
                frappe.msgprint({
                    title: "Error",
                    message: r.message?.message || "Failed to get candidate suggestions",
                    indicator: "red"
                });
                return;
            }

            const candidates = r.message.candidates || [];
            const criteria = r.message.criteria || {};

            if (candidates.length === 0) {
                frappe.msgprint({
                    title: "No Matches Found",
                    message: "No candidates found matching the job opening criteria.",
                    indicator: "orange"
                });
                return;
            }

            // Show candidates in a dialog
            show_opening_candidates_dialog(frm, candidates, criteria);
        }
    });
}

function show_opening_candidates_dialog(frm, candidates, criteria) {
    let selected_candidates = [];
    // Track selected candidates across pages by candidate.name
    let selected_map = {};
    const page_size = 10;
    let current_page = 1;
    let filtered_candidates = [...candidates];

    // Build matching criteria summary (show all categories used in scoring) in a row layout
    const criteria_parts = [];
    if (criteria.designation) {
        criteria_parts.push(`<strong>Designation:</strong> ${criteria.designation}`);
    }
    if (criteria.min_experience || criteria.max_experience) {
        const minExp = criteria.min_experience || 0;
        const maxExp = criteria.max_experience || "∞";
        criteria_parts.push(
            `<strong>Experience:</strong> ${minExp}-${maxExp} years`
        );
    }
    if (criteria.must_have_skills) {
        criteria_parts.push(
            `<strong>Must-have Skills:</strong> ${criteria.must_have_skills}`
        );
    }
    if (criteria.good_to_have_skills) {
        criteria_parts.push(
            `<strong>Good-to-have Skills:</strong> ${criteria.good_to_have_skills}`
        );
    }
    if (criteria.required_certifications) {
        criteria_parts.push(
            `<strong>Certifications:</strong> ${criteria.required_certifications}`
        );
    }
    if (criteria.location) {
        criteria_parts.push(`<strong>Location:</strong> ${criteria.location}`);
    }
    if (criteria.gender_preference && !["NA", "Any"].includes(criteria.gender_preference)) {
        criteria_parts.push(
            `<strong>Gender Preference:</strong> ${criteria.gender_preference}`
        );
    }
    if (criteria.min_ctc || criteria.max_ctc) {
        const minCtc = criteria.min_ctc || "NA";
        const maxCtc = criteria.max_ctc || "NA";
        criteria_parts.push(
            `<strong>CTC Range:</strong> ${minCtc} – ${maxCtc}</strong>`
        );
    }

    const criteria_html =
        criteria_parts.length > 0
            ? `<div class="row">
                    ${criteria_parts
                        .map(
                            part =>
                                `<div class="col-sm-4 mb-1" style="font-size:0.85em; color:#495057;">${part}</div>`
                        )
                        .join("")}
               </div>`
            : `<div class="row">
                    <div class="col-sm-12">
                        <em>No specific criteria; showing all non-blacklisted candidates.</em>
                    </div>
               </div>`;

    // Base HTML structure with filters, list container, pagination, and selected count
    let candidates_html = `
        <div>
            <div class="mb-3 p-2" style="background: #f8f9fa; border-radius: 4px;">
                <strong>Matching Criteria:</strong>
                <div style="margin-top: 4px;">
                    ${criteria_html}
                </div>
            </div>
            <div class="row mb-2">
                <div class="col-sm-4 mb-2">
                    <input type="text" class="form-control" id="opening-filter-search"
                           placeholder="Search by name / skills">
                </div>
                <div class="col-sm-3 mb-2">
                    <input type="number" class="form-control" id="opening-filter-min-match"
                           placeholder="Matching score %">
                </div>
                <div class="col-sm-2 mb-2">
                    <select class="form-control" id="opening-filter-gender">
                        <option value="">All Genders</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Not Disclosed">Not Disclosed</option>
                    </select>
                </div>
                <div class="col-sm-3 mb-2 d-flex align-items-center">
                    <label style="margin: 0;">
                        <input type="checkbox" id="opening-filter-hide-nopoach">
                        <span class="ml-1">Hide No-Poach</span>
                    </label>
                </div>
            </div>
            <div class="row mb-2">
                <div class="col-sm-3 mb-2">
                    <input type="number" class="form-control" id="opening-filter-min-age"
                           placeholder="Min age">
                </div>
                <div class="col-sm-3 mb-2">
                    <input type="number" class="form-control" id="opening-filter-max-age"
                           placeholder="Max age">
                </div>
                <div class="col-sm-3 mb-2">
                    <input type="number" class="form-control" id="opening-filter-min-ctc"
                           placeholder="Min expected CTC">
                </div>
                <div class="col-sm-3 mb-2">
                    <input type="number" class="form-control" id="opening-filter-max-ctc"
                           placeholder="Max expected CTC">
                </div>
            </div>
            <div id="opening-candidates-list" style="max-height: 420px; overflow-y: auto;"></div>
            <div id="opening-candidates-pagination" class="mt-2 d-flex justify-content-between align-items-center"></div>
        </div>
    `;

    let d = new frappe.ui.Dialog({
        title: `Matching Candidates`,
        size: "large",
        fields: [
            {
                fieldtype: "HTML",
                options: candidates_html
            }
        ],
        primary_action_label: "Add Selected",
        primary_action: () => {
            // Build selected candidate list from persistent selection map
            selected_candidates = [];
            let blocked_candidates = [];

            candidates.forEach(candidate => {
                const candidate_name = candidate.name;
                if (!selected_map[candidate_name]) {
                    return;
                }
                if (candidate.is_no_poach) {
                    blocked_candidates.push({
                        name: candidate.candidate_name || candidate.name,
                        reason: "no-poach",
                        company: candidate.no_poach_company
                    });
                } else {
                    selected_candidates.push(candidate_name);
                }
            });

            // Show warning if blocked candidates were selected
            if (blocked_candidates.length > 0) {
                let blocked_msg = "The following candidates cannot be added:\n\n";
                blocked_candidates.forEach(bc => {
                    if (bc.reason === "no-poach") {
                        blocked_msg += `• ${bc.name} - No-Poach (${bc.company})\n`;
                    }
                });
                frappe.msgprint({
                    title: "⚠️ Cannot Add Selected Candidates",
                    message: blocked_msg,
                    indicator: "orange"
                });
            }

            if (selected_candidates.length === 0) {
                if (blocked_candidates.length === 0) {
                    frappe.msgprint({
                        title: "No Selection",
                        message: "Please select at least one candidate to add.",
                        indicator: "orange"
                    });
                }
                return;
            }

            // Add candidates to Job Opening's candidates_table
            add_candidates_to_opening(frm, selected_candidates);
            d.hide();
        },
        secondary_action_label: "Close",
        secondary_action: () => d.hide()
    });
    d.show();

    function ensureSelectedCountFooter() {
        const $footer = d.$wrapper.find(".modal-footer");
        if (!$footer.find("#opening-selected-count").length) {
            const countHtml = `
                <div id="opening-selected-count"
                     class="text-muted mr-auto"
                     style="font-size: 0.85em;">
                    Selected: 0 candidate(s)
                </div>`;
            // Place it on the left side of the footer, same row as buttons
            $footer.prepend(countHtml);
        }
    }

    function updateSelectedCount() {
        const count = Object.keys(selected_map).length;
        ensureSelectedCountFooter();
        d.$wrapper
            .find("#opening-selected-count")
            .text(`Selected: ${count} candidate(s)`);
    }

    // ---- Filtering & Pagination Helpers ----
    function applyFilters() {
        const search = d.$wrapper.find("#opening-filter-search").val()?.toLowerCase() || "";
        const minMatch = parseFloat(d.$wrapper.find("#opening-filter-min-match").val()) || 0;
        const hideNoPoach = d.$wrapper.find("#opening-filter-hide-nopoach").is(":checked");
        const genderFilter = d.$wrapper.find("#opening-filter-gender").val() || "";
        const minAge = parseInt(d.$wrapper.find("#opening-filter-min-age").val() || "", 10);
        const maxAge = parseInt(d.$wrapper.find("#opening-filter-max-age").val() || "", 10);
        const minCtcFilter = parseFloat(d.$wrapper.find("#opening-filter-min-ctc").val() || "");
        const maxCtcFilter = parseFloat(d.$wrapper.find("#opening-filter-max-ctc").val() || "");

        filtered_candidates = candidates.filter(c => {
            if (hideNoPoach && c.is_no_poach) return false;

            const matchOk = (c.match_score || 0) >= minMatch;

            // Gender filter (if selected)
            if (genderFilter && (c.gender || "") !== genderFilter) {
                return false;
            }

            // Age filter
            if (!Number.isNaN(minAge) || !Number.isNaN(maxAge)) {
                const candAge = parseInt(c.age || "", 10);
                if (!Number.isNaN(candAge)) {
                    if (!Number.isNaN(minAge) && candAge < minAge) return false;
                    if (!Number.isNaN(maxAge) && candAge > maxAge) return false;
                }
            }

            // CTC filter (uses expected_ctc if available, else current_ctc)
            if (!Number.isNaN(minCtcFilter) || !Number.isNaN(maxCtcFilter)) {
                const candCtc = parseFloat(c.expected_ctc || c.current_ctc || "");
                if (!Number.isNaN(candCtc)) {
                    if (!Number.isNaN(minCtcFilter) && candCtc < minCtcFilter) return false;
                    if (!Number.isNaN(maxCtcFilter) && candCtc > maxCtcFilter) return false;
                }
            }

            const text = [
                c.candidate_name,
                c.name,
                c.current_designation,
                c.skills_tags,
                c.primary_skill_set,
                c.secondary_skill_set
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const searchOk = !search || text.includes(search);

            return matchOk && searchOk;
        });

        current_page = 1;
        renderList();
    }

    function renderList() {
        const total = filtered_candidates.length;
        const total_pages = Math.max(1, Math.ceil(total / page_size));
        if (current_page > total_pages) current_page = total_pages;

        const start = (current_page - 1) * page_size;
        const pageItems = filtered_candidates.slice(start, start + page_size);

        const $list = d.$wrapper.find("#opening-candidates-list");
        $list.empty();

        if (!pageItems.length) {
            $list.html(
                '<div class="text-muted text-center py-3">No candidates match the current filters.</div>'
            );
        } else {
            pageItems.forEach((candidate, index) => {
                const matchPercentage = Math.min(100, candidate.match_score);
                const matchColor =
                    matchPercentage >= 70 ? "#28a745" : matchPercentage >= 50 ? "#ffc107" : "#17a2b8";
                const is_no_poach = candidate.is_no_poach || false;
                const cardBorderColor = is_no_poach ? "#ffc107" : "#dee2e6";
                const cardBgColor = is_no_poach ? "#fffbf0" : "#fff";
                const globalIndex = start + index;

                const cardHtml = `
                    <div class="candidate-card mb-3 p-3"
                         style="border: 2px solid ${cardBorderColor}; border-radius: 6px; background: ${cardBgColor};">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center mb-2">
                                    <input type="checkbox" class="candidate-checkbox mr-2"
                                           data-candidate="${candidate.name}"
                                           id="opening-candidate-${globalIndex}"
                                           ${is_no_poach ? "disabled" : ""}>
                                    <label for="opening-candidate-${globalIndex}"
                                           style="margin: 0; cursor: ${is_no_poach ? "not-allowed" : "pointer"};">
                                        <strong>${candidate.candidate_name || candidate.name}</strong>
                                    </label>
                                    ${
                                        is_no_poach
                                            ? `
                                        <span class="badge badge-warning ml-2"
                                              style="background: #ffc107; color: #000; padding: 4px 8px; border-radius: 4px; font-size: 0.75em;">
                                            🚫 No-Poach
                                        </span>
                                    `
                                            : ""
                                    }
                                </div>
                                <div class="ml-4" style="font-size: 0.9em; color: #6c757d;">
                                    <div><strong>Designation:</strong> ${candidate.current_designation || "-"}</div>
                                    <div><strong>Experience:</strong> ${candidate.total_experience_years || 0} years</div>
                                    <div><strong>Location:</strong> ${candidate.current_location || "-"}</div>
                                    <div><strong>Skills:</strong> ${candidate.skills_tags || candidate.primary_skill_set || "-"}</div>
                                    ${
                                        candidate.key_certifications
                                            ? `<div><strong>Certifications:</strong> ${candidate.key_certifications}</div>`
                                            : ""
                                    }
                                </div>
                                <div class="ml-4 mt-2">
                                    <small style="color: #6c757d;">
                                        <strong>Match Reasons:</strong> ${candidate.match_reasons.join(", ")}
                                    </small>
                                    ${
                                        is_no_poach
                                            ? `
                                        <div class="mt-1">
                                            <small style="color: #856404;">
                                                <strong>⚠️ No-Poach:</strong> Currently employed at
                                                <b>${candidate.no_poach_company || "Unknown Company"}</b>
                                            </small>
                                        </div>
                                    `
                                            : ""
                                    }
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="match-score" style="
                                    background: ${matchColor};
                                    color: white;
                                    padding: 8px 12px;
                                    border-radius: 20px;
                                    font-weight: bold;
                                    font-size: 0.9em;
                                ">
                                    ${matchPercentage}% Match
                                </div>
                                <a href="/app/dkp_candidate/${candidate.name}" target="_blank"
                                   class="btn btn-sm btn-link mt-2" style="font-size: 0.8em;">
                                    View Profile
                                </a>
                            </div>
                        </div>
                    </div>
                `;

                $list.append(cardHtml);
            });
        }

        // Restore checkbox state from selection map and bind change handlers
        d.$wrapper.find(".candidate-checkbox").each(function () {
            const candidate_name = $(this).data("candidate");
            if (selected_map[candidate_name]) {
                $(this).prop("checked", true);
            }
        });

        d.$wrapper.find(".candidate-checkbox").off("change").on("change", function () {
            const candidate_name = $(this).data("candidate");
            if ($(this).is(":checked")) {
                selected_map[candidate_name] = true;
            } else {
                delete selected_map[candidate_name];
            }
            updateSelectedCount();
        });

        // Render pagination controls
        const $pager = d.$wrapper.find("#opening-candidates-pagination");
        $pager.empty();
        if (total_pages <= 1) {
            $pager.html(
                `<small class="text-muted">Showing ${total} candidate(s)</small>`
            );
            return;
        }

        const startIdx = total === 0 ? 0 : start + 1;
        const endIdx = Math.min(start + page_size, total);

        const infoHtml = `<small class="text-muted">Showing ${startIdx}-${endIdx} of ${total} candidate(s)</small>`;
        const controlsHtml = `
            <div>
                <button class="btn btn-sm btn-outline-secondary mr-1" id="opening-page-prev"
                        ${current_page === 1 ? "disabled" : ""}>
                    Prev
                </button>
                <span>Page ${current_page} of ${total_pages}</span>
                <button class="btn btn-sm btn-outline-secondary ml-1" id="opening-page-next"
                        ${current_page === total_pages ? "disabled" : ""}>
                    Next
                </button>
            </div>
        `;

        $pager.html(
            `<div class="d-flex justify-content-between align-items-center w-100">
                <div>${infoHtml}</div>
                ${controlsHtml}
            </div>`
        );

        // Bind pagination buttons
        d.$wrapper.find("#opening-page-prev").on("click", () => {
            if (current_page > 1) {
                current_page -= 1;
                renderList();
            }
        });
        d.$wrapper.find("#opening-page-next").on("click", () => {
            if (current_page < total_pages) {
                current_page += 1;
                renderList();
            }
        });
    }

    // Bind filter events
    d.$wrapper.find("#opening-filter-search").on("input", () => {
        applyFilters();
    });
    d.$wrapper.find("#opening-filter-min-match").on("input", applyFilters);
    d.$wrapper.find("#opening-filter-gender").on("change", applyFilters);
    d.$wrapper.find("#opening-filter-min-age").on("input", applyFilters);
    d.$wrapper.find("#opening-filter-max-age").on("input", applyFilters);
    d.$wrapper.find("#opening-filter-min-ctc").on("input", applyFilters);
    d.$wrapper.find("#opening-filter-max-ctc").on("input", applyFilters);
    d.$wrapper.find("#opening-filter-hide-nopoach").on("change", applyFilters);

    // Initial render
    applyFilters();
    updateSelectedCount();
}

function add_candidates_to_opening(frm, candidate_names) {
    if (!candidate_names || candidate_names.length === 0) return;

    candidate_names.forEach(candidate_name => {
        let row = frm.add_child("candidates_table");
        frappe.model.set_value(row.doctype, row.name, "candidate_name", candidate_name);
    });

    frm.refresh_field("candidates_table");

    frappe.show_alert(
        {
            message: `${candidate_names.length} candidate(s) added successfully`,
            indicator: "green"
        },
        3
    );
}

frappe.ui.form.on("DKP_JobApplication_Child", {
	stage: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];

		if (row.stage === "Shortlisted For Interview") {
			add_candidate_to_interview_table(frm, row.candidate_name);
		}
	}
});
function add_candidate_to_interview_table(frm, candidate_name) {
	if (!candidate_name) return;

	// 🔁 Avoid duplicates
	let exists = frm.doc.dkp_jobopeninginterview_child?.some(
		r => r.candidate_name === candidate_name
	);

	if (exists) {
		return;
	}

	let new_row = frm.add_child("interview");
	new_row.candidate_name = candidate_name;

	frm.refresh_field("interview");
}
frappe.ui.form.on("DKP_JobApplication_Child", {
	stage: function (frm, cdt, cdn) {
		let show = false;

		(frm.doc.candidates_table || []).forEach(row => {
			if (row.stage === "Shortlisted For Interview") {
				show = true;
			}
		});

		frm.set_value("show_interview_table", show ? 1 : 0);
	}
});

