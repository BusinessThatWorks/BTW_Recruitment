frappe.ui.form.on("DKP_Job_Opening", {
    refresh(frm) {
        frm.set_query("assign_recruiter", "candidates_table", function (doc, cdt, cdn) {
            // Get already assigned recruiters
            let assigned = (frm.doc.candidates_table || [])
                .map(row => row.assign_recruiter)
                .filter(r => r);

            return {
                filters: {
                    role_profile_name: ["in", ["DKP Recruiter", "DKP Recruiter - Exclusive", "Admin"]],
                    name: ["not in", assigned]
                }
            };
        });
    },

    // Button on Job Opening: Suggest Candidates
    suggest_candidates(frm) {
        show_opening_candidate_suggestions(frm);
    }
});
frappe.ui.form.on("DKP_Job_Opening", {
    after_save(frm) {
        if (!frm.doc.company_name) return;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.company_rules.mark_company_active",
            args: { company: frm.doc.company_name },
        });
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
function update_previous_openings_button_count(
    $button,
    candidate_name,
    current_job_opening
) {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.doctype.dkp_job_opening.dkp_job_opening.get_candidate_previous_openings_count",
        args: {
            candidate_name: candidate_name,
            current_job_opening: current_job_opening
        },
        callback(r) {
            if (r.message && r.message.success) {
                const count = r.message.count || 0;

                if (count > 0) {
                    $button.text(`📂 Previous Openings (${count})`);
                } else {
                    $button.text("📂 Previous Openings");
                }
            }
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
                    // allow add
                    selected_candidates.push(candidate_name);

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
                let blocked_msg = "The following candidates is:\n\n";
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

            // Build candidate display names map
            const candidate_display_names = {};
            candidates.forEach(candidate => {
                if (selected_map[candidate.name]) {
                    candidate_display_names[candidate.name] = candidate.candidate_name || candidate.name;
                }
            });

            // Show previous openings dialog for selected candidates before adding
            const current_job_opening = frm.doc.name;
            show_multiple_candidates_previous_openings(selected_candidates, candidate_display_names, current_job_opening, () => {
                // After dialog is closed, add candidates to Job Opening's candidates_table
                add_candidates_to_opening(frm, selected_candidates);
            });
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
                                           >
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
                                <div><strong>Age:</strong> ${candidate.age || "-"}</div>
                                    <div><strong>Designation:</strong> ${candidate.current_designation || "-"}</div>
                                    <div><strong>Experience:</strong> ${candidate.total_experience_years || 0} years</div>
                                    <div><strong>Location:</strong> ${candidate.current_location || "-"}</div>
                                    <div><strong>Skills:</strong> ${candidate.skills_tags || candidate.primary_skill_set || "-"}</div>
                                    ${
                                        candidate.key_certifications
                                            ? `<div><strong>Certifications:</strong> ${candidate.key_certifications}</div>`
                                            : ""
                                    }
                                    <div><strong>Current CTC:</strong> ${candidate.current_ctc || "-"}</div>
                                    <div><strong>Expected CTC:</strong> ${candidate.expected_ctc || "-"}</div>
                                </div>
                                <div class="ml-4 mt-2">
                                    <div class="mb-1">
                                        <small style="color: #6c757d;">
                                            <strong>Match Reasons:</strong> ${candidate.match_reasons.join(", ")}
                                        </small>
                                    </div>
                                    ${(candidate.matched_skills && candidate.matched_skills.length)
                                        ? `
                                    <div class="mb-1">
                                        <small style="color: #6c757d;">
                                            <strong>Matched Skills:</strong> <span class="text-primary">${candidate.matched_skills.join(", ")}</span>
                                        </small>
                                    </div>
                                    `
                                        : ""}
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
                            <div class="candidate-actions text-right">
                                <div class="text-right" style="min-width: 170px;">
                                <div class="match-score" style="
                                    background: ${matchColor};
                                    color: #ffffff;
                                    padding: 8px 12px;
                                    border-radius: 20px;
                                    font-weight: bold;
                                    font-size: 0.9em;
                                    margin-bottom: 14px;
                                    text-align: center;
                                ">
                                    ${matchPercentage}% Match
                                </div>

                                <a href="/app/dkp_candidate/${candidate.name}" target="_blank"
                            style="
                                    display: block;
                                    background-color: #f8fafc;
                                    color: #1f2937;
                                    font-size: 0.8em;
                                    width: 100%;
                                    margin-bottom: 16px;
                                    border-radius: 6px;
                                    text-decoration: none;
                                    padding: 7px 10px;
                                    text-align: center;
                                    border: 1px solid #d1d5db;
                                    cursor: pointer;
                            "
                            onmouseover="this.style.backgroundColor='#e5e7eb'"
                            onmouseout="this.style.backgroundColor='#f8fafc'">
                                View Profile
                            </a>

                                <button class="previous-openings-btn"
                                        data-candidate="${candidate.name}"
                                        style="
                                            background-color: #fef3c7;
                                            color: #92400e;
                                            font-size: 0.8em;
                                            width: 100%;
                                            border: 1px solid #f59e0b;
                                            border-radius: 6px;
                                            padding: 7px 10px;
                                            cursor: pointer;
                                        "
                                        onmouseover="this.style.backgroundColor='#fde68a'"
                                        onmouseout="this.style.backgroundColor='#fef3c7'">
                                    📂 Previous Openings
                                </button>
                            </div>


                        </div>
                    </div>
                `;

                $list.append(cardHtml);
                const $last_card = $list.children().last();
                const $prev_btn = $last_card.find(".previous-openings-btn");

                update_previous_openings_button_count(
                    $prev_btn,
                    candidate.name,
                    frm.doc.name
                );

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

    // Bind Previous Openings button click handlers using event delegation
    // This is bound once when dialog is created, works for all dynamically created buttons
    d.$wrapper.on("click", ".previous-openings-btn", function(e) {
        e.preventDefault();
        e.stopPropagation();
        const candidate_name = $(this).data("candidate");
        const current_job_opening = frm.doc.name;
        if (!candidate_name) {
            frappe.msgprint({
                title: "Error",
                message: "Candidate name not found",
                indicator: "red"
            });
            return;
        }
        if (typeof show_previous_openings_dialog === "function") {
            show_previous_openings_dialog(candidate_name, current_job_opening);
        } else {
            frappe.msgprint({
                title: "Error",
                message: "Function not found",
                indicator: "red"
            });
        }
    });

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

// --------- PREVIOUS OPENINGS DIALOG ----------

function show_previous_openings_dialog(candidate_name, current_job_opening) {
    // Show loading state
    frappe.show_alert({
        message: "Loading previous openings...",
        indicator: "blue"
    }, 2);

    // Fetch previous openings from backend
    frappe.call({
        method: "btw_recruitment.btw_recruitment.doctype.dkp_job_opening.dkp_job_opening.get_candidate_previous_openings",
        args: {
            candidate_name: candidate_name,
            current_job_opening: current_job_opening
        },
        callback(r) {
            if (!r.message || !r.message.success) {
                frappe.msgprint({
                    title: "Error",
                    message: r.message?.message || "Failed to fetch previous openings",
                    indicator: "red"
                });
                return;
            }

            const openings = r.message.openings || [];

            if (openings.length === 0) {
                frappe.msgprint({
                    title: "No Previous Openings",
                    message: "This candidate has no previous job openings.",
                    indicator: "orange"
                });
                return;
            }

            // Build HTML for openings list
            const openings_html = `
                <div id="previous-openings-list" style="max-height: 500px; overflow-y: auto;">
                    ${openings.map((opening, index) => {
                        const stage = opening.stage || "Stage Not Set";
                        const stageColor = getStageColor(stage);
                        const formattedDate = opening.opening_created ? 
                            frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string(opening.opening_created)) : "-";
                        
                        return `
                            <div class="previous-opening-card mb-3 p-3"
                                 style="border: 1px solid #dee2e6; border-radius: 6px; background: #fff;">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div class="flex-grow-1">
                                        <div class="mb-2">
                                            <strong style="font-size: 1.1em;">${opening.job_opening_name || "-"}</strong>
                                        </div>
                                        <div style="font-size: 0.9em; color: #6c757d;">
                                            <div><strong>Designation:</strong> ${opening.designation || "-"}</div>
                                            <div><strong>Company:</strong> ${opening.company_name || "-"}</div>
                                            ${opening.department ? `<div><strong>Department:</strong> ${opening.department}</div>` : ""}
                                            ${opening.location ? `<div><strong>Location:</strong> ${opening.location}</div>` : ""}
                                            <div><strong>Status:</strong> ${opening.opening_status || "-"}</div>
                                            <div><strong>Created:</strong> ${formattedDate}</div>
                                        </div>
                                        ${opening.remarks ? `
                                            <div class="mt-2" style="font-size: 0.85em; color: #495057;">
                                                <strong>Remarks:</strong> ${opening.remarks}
                                            </div>
                                        ` : ""}
                                    </div>
                                    <div class="text-right ml-3">
                                        <div class="stage-badge" style="
                                            background: ${stageColor};
                                            color: white;
                                            padding: 8px 16px;
                                            border-radius: 20px;
                                            font-weight: bold;
                                            font-size: 0.9em;
                                            white-space: nowrap;
                                        ">
                                            ${stage}
                                        </div>
                                        <a href="/app/dkp_job_opening/${opening.job_opening_name}" target="_blank"
                                           class="btn btn-sm btn-secondary mt-2" style="font-size: 0.8em;">
                                            View Opening
                                        </a>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
            const days_used = r.message.days_used || 7;

            // Create and show dialog
            const dialog = new frappe.ui.Dialog({
                 title: `Previous Openings (${days_used} Days) - ${candidate_name}`,
                size: "small",
                fields: [
                    {
                        fieldtype: "HTML",
                        options: openings_html
                    }
                ],
                primary_action_label: "Close",
                primary_action: () => dialog.hide()
            });

            dialog.show();
        }
    });
}

function getStageColor(stage) {
   const stageColors = {
    "Schedule Interview": "#4A90E2",   // calm blue
    "Submitted To Client": "#7B61FF",   // clean purple
    "Rejected By Client": "#E5533D",    // soft red (not harsh)
};
    return stageColors[stage] || "#6c757d";
}

// --------- MULTIPLE CANDIDATES PREVIOUS OPENINGS DIALOG ----------

function show_multiple_candidates_previous_openings(candidate_names, candidate_display_names, current_job_opening, callback) {
    if (!candidate_names || candidate_names.length === 0) {
        if (callback) callback();
        return;
    }

    // Show loading state
    frappe.show_alert({
        message: "Loading previous openings for selected candidates...",
        indicator: "blue"
    }, 2);

    // Fetch previous openings for all candidates
    const promises = candidate_names.map(candidate_name => {
        return frappe.call({
            method: "btw_recruitment.btw_recruitment.doctype.dkp_job_opening.dkp_job_opening.get_candidate_previous_openings",
            args: {
                candidate_name: candidate_name,
                current_job_opening: current_job_opening
            }
        });
    });

    Promise.all(promises).then(results => {
        // Organize openings by candidate
        const candidate_openings_map = {};
        let has_any_openings = false;

        results.forEach((r, index) => {
            const candidate_name = candidate_names[index];
            if (r.message && r.message.success) {
                const openings = r.message.openings || [];
                if (openings.length > 0) {
                    has_any_openings = true;
                    candidate_openings_map[candidate_name] = openings;
                } else {
                    candidate_openings_map[candidate_name] = [];
                }
            } else {
                candidate_openings_map[candidate_name] = [];
            }
        });

        // Build HTML for all candidates' openings
        let openings_html = `
            <div id="multiple-candidates-openings-list" style="max-height: 500px; overflow-y: auto;">
        `;

        candidate_names.forEach(candidate_name => {
            const openings = candidate_openings_map[candidate_name] || [];
            const display_name = candidate_display_names[candidate_name] || candidate_name;
            
            openings_html += `
                <div class="candidate-section mb-4" style="border-bottom: 2px solid #dee2e6; padding-bottom: 15px;">
                    <div class="mb-2">
                        <strong style="font-size: 1.2em; color: #495057;">${display_name}</strong>
                    </div>
            `;

            if (openings.length === 0) {
                openings_html += `
                    <div class="text-muted" style="font-size: 0.9em; padding-left: 10px;">
                        No previous openings found.
                    </div>
                `;
            } else {
                openings.forEach((opening, index) => {
                    const stage = opening.stage || "Stage Not Set";
                    const stageColor = getStageColor(stage);
                    const formattedDate = opening.opening_created ? 
                        frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string(opening.opening_created)) : "-";
                    
                    openings_html += `
                        <div class="previous-opening-card mb-3 p-3"
                             style="border: 1px solid #dee2e6; border-radius: 6px; background: #fff; margin-left: 10px;">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="flex-grow-1">
                                    <div class="mb-2">
                                        <strong style="font-size: 1.1em;">${opening.job_opening_name || "-"}</strong>
                                    </div>
                                    <div style="font-size: 0.9em; color: #6c757d;">
                                        <div><strong>Designation:</strong> ${opening.designation || "-"}</div>
                                        <div><strong>Company:</strong> ${opening.company_name || "-"}</div>
                                        ${opening.department ? `<div><strong>Department:</strong> ${opening.department}</div>` : ""}
                                        ${opening.location ? `<div><strong>Location:</strong> ${opening.location}</div>` : ""}
                                        <div><strong>Status:</strong> ${opening.opening_status || "-"}</div>
                                        <div><strong>Created:</strong> ${formattedDate}</div>
                                    </div>
                                    ${opening.remarks ? `
                                        <div class="mt-2" style="font-size: 0.85em; color: #495057;">
                                            <strong>Remarks:</strong> ${opening.remarks}
                                        </div>
                                    ` : ""}
                                </div>
                                <div class="text-right ml-3">
                                    <div class="stage-badge" style="
                                        background: ${stageColor};
                                        color: white;
                                        padding: 8px 16px;
                                        border-radius: 20px;
                                        font-weight: bold;
                                        font-size: 0.9em;
                                        white-space: nowrap;
                                    ">
                                        ${stage}
                                    </div>
                                    <a href="/app/dkp_job_opening/${opening.job_opening_name}" target="_blank"
                                       class="btn btn-sm btn-secondary mt-2" style="font-size: 0.8em;">
                                        View Opening
                                    </a>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

            openings_html += `</div>`;
        });

        openings_html += `</div>`;

        const days_used =
        results[0]?.message?.days_used || 7;
        // Create and show dialog
        const dialog = new frappe.ui.Dialog({
            title: `Previous Openings(${days_used} Days) - ${candidate_names.length} Selected Candidate(s)`,
            size: "large",
            fields: [
                {
                    fieldtype: "HTML",
                    options: openings_html
                }
            ],
            primary_action_label: "Continue & Add Candidates",
            primary_action: () => {
                dialog.hide();
                if (callback) callback();
            },
            secondary_action_label: "Cancel",
            secondary_action: () => {
                dialog.hide();
            }
        });

        dialog.show();
    }).catch(error => {
        frappe.msgprint({
            title: "Error",
            message: "Failed to fetch previous openings for some candidates.",
            indicator: "red"
        });
        // Still proceed with adding candidates even if there's an error
        if (callback) callback();
    });
}

// Improved interview creation with check for candidate selection and better flow
frappe.ui.form.on("DKP_JobApplication_Child", {
    create_interview(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.candidate_name) {
            frappe.msgprint("Please select a candidate first");
            return;
        }

        frappe.db.get_value(
            "DKP_Interview",
            {
                job_opening: frm.doc.name,
                candidate_name: row.candidate_name
            },
            "name"
        ).then(r => {
            if (r.message && r.message.name) {
                // ✅ Interview exists → OPEN it
                frappe.set_route("Form", "DKP_Interview", r.message.name);
                return;
            }

            // ✅ Interview does not exist → CREATE it
            frappe.new_doc("DKP_Interview", {
                job_opening: frm.doc.name,
                candidate_name: row.candidate_name
            });
        });
    }
});

// --------- CANDIDATE manual addition VALIDATIONS ----------
frappe.ui.form.on("DKP_JobApplication_Child", {
    candidate_name(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.candidate_name) return;

        // Check for duplicate candidates first
        let duplicate = false;

        (frm.doc.candidates_table || []).forEach(r => {
            if (
                r.name !== row.name &&
                r.candidate_name === row.candidate_name
            ) {
                duplicate = true;
            }
        });

        if (duplicate) {
            frappe.msgprint({
                title: __("Duplicate Candidate"),
                message: __(
                    `Candidate <b>${row.candidate_name}</b> is already added in this job opening.`
                ),
                indicator: "red"
            });

            frappe.model.set_value(cdt, cdn, "candidate_name", "");
            return;
        }

        // Check blacklisted and no-poach status
        frappe.db.get_value("DKP_Candidate", row.candidate_name, [
            "blacklisted",
            "current_company_master"
        ]).then((r) => {
            if (!r.message) return;

            const candidate = r.message;

            // Check if candidate is blacklisted - prevent adding
            if (candidate.blacklisted === "Yes") {
                frappe.msgprint({
                    title: __("Blacklisted Candidate"),
                    message: __(
                        `Candidate <b>${row.candidate_name}</b> is blacklisted and cannot be added to this job opening.`
                    ),
                    indicator: "red"
                });
                frappe.model.set_value(cdt, cdn, "candidate_name", "");
                return;
            }

            // Check if candidate's current company (Customer) has no-poach - allow but warn
            if (candidate.current_company_master) {
                frappe.db.get_value("Customer", candidate.current_company_master, [
                    "custom_no_poach_flag",
                    "customer_name"
                ]).then((company_r) => {
                    if (company_r.message && company_r.message.custom_no_poach_flag === "Yes") {
                        const company_label = company_r.message.customer_name || candidate.current_company_master;
                        frappe.msgprint({
                            title: __("No-Poach Warning"),
                            message: __(
                                `Candidate <b>${row.candidate_name}</b> is currently employed at <b>${company_label}</b> which has a No-Poach policy.`
                            ),
                            indicator: "orange"
                        });
                        // Allow adding but show warning
                    }
                });
            }
        });
    }
});





