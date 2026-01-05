
frappe.ui.form.on("DKP_Job_Application", {
    company_name: function(frm) {
        // Clear current value
        frm.set_value("job_opening_title", "");

        // Refresh query for job opening
        frm.set_query("job_opening_title", function() {
            return {
                filters: {
                    company: frm.doc.company_name
                }
            };
        });
    }
});

frappe.ui.form.on("DKP_JobApplication_Child", {
    candidate_name: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (!row.candidate_name) return;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.doctype.dkp_job_application.dkp_job_application.get_candidate_status",
            args: {
                candidate: row.candidate_name
            },
            callback: function(r) {
                if (!r.message) return;

                if (r.message.blacklisted) {
                    frappe.msgprint({
                        title: "🚫 Candidate Blacklisted",
                        message: `Candidate <b>${row.candidate_name}</b> is blacklisted and cannot be added.`,
                        indicator: "red"
                    });
                    row.candidate_name = "";
                    frm.refresh_field("table_akka");
                }

                // if (r.message.cooling) {
                //     frappe.msgprint({
                //         title: "❄️ Cooling Period Active",
                //         message: `Candidate <b>${row.candidate_name}</b> has an active cooling period. Remaining: <b>${r.message.remaining_days} days</b>`,
                //         indicator: "orange"
                //     });
                //     row.candidate_name = "";
                //     frm.refresh_field("table_akka");
                // }
                if (r.message.no_poach) {
                    frappe.msgprint({
                        title: "🚫 No-Poach Restriction",
                        message: `Candidate <b>${row.candidate_name}</b> is currently employed at <b>${r.message.no_poach_company}</b>, which is marked as <b>No-Poach</b>.`,
                        indicator: "red"
                    });
                    row.candidate_name = "";
                    frm.refresh_field("table_akka");
                }
            }
        });
    }
});
frappe.ui.form.on('DKP_Job_Application', {
    refresh: function(frm) {
        // Load job openings when form loads
        if (frm.doc.company_name) {
            load_job_openings(frm);
        }
    },

    company_name: function(frm) {
        // When company is selected, clear and reload job openings
        frm.set_value('job_opening_title', '');
        load_job_openings(frm);
    },
    
    show_candidate_suggestions: function(frm) {
        // Handle button click to show candidate suggestions
        show_candidate_suggestions(frm);
    }
});

function load_job_openings(frm) {
    if (!frm.doc.company_name) {
        frappe.msgprint('Please select a company first');
        return;
    }

    // Show loading indicator
    frm.set_df_property('job_opening_title', 'description', 'Loading job openings...');

    // Call Python API
    frappe.call({
        method: 'btw_recruitment.btw_recruitment.doctype.dkp_job_application.dkp_job_application.get_open_job_openings',
        args: {
            company_name: frm.doc.company_name
        },
        callback: function(r) {
            if (r.message && r.message.success) {
                const job_options = r.message.data;

                if (job_options.length === 0) {
                    frm.set_df_property('job_opening_title', 'description', 'No open positions available');
                    return;
                }

                // Create options string for Select field - use job opening name only
                let options = job_options.map(job => job.value).join('\n');

                // Update the field with new options (using names only)
                frm.set_df_property('job_opening_title', 'options', options);
                frm.set_df_property('job_opening_title', 'description', `Found ${job_options.length} open position(s)`);

                // Refresh the field
                frm.refresh_field('job_opening_title');

            } else {
                frappe.msgprint('Error loading job openings');
                frm.set_df_property('job_opening_title', 'description', 'Error loading positions');
            }
        }
    });
}
frappe.ui.form.on("DKP_JobApplication_Child", {
    candidate_name(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.candidate_name) return;

        check_candidate_mapping(frm, row.candidate_name);
    }
});
function check_candidate_mapping(frm, candidate) {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.job_application.check_candidate_existing_applications",
        args: {
            candidate: candidate,
            current_application: frm.doc.name
        },
        callback(r) {
            if (!r.message || !r.message.length) return;

            show_candidate_popover(candidate, r.message);
        }
    });
}
function show_candidate_popover(candidate, data) {
    let html = `
        <div style="line-height:1.6">
            <b>${candidate}</b> is already mapped in:
            <ul style="margin-top:8px">
    `;

    data.forEach(d => {
        let badge = "secondary";

        if (d.stage === "Joined") badge = "danger";
        else badge = "warning";

        html += `
            <li>
                <b>${d.company_name}</b>
                <span class="badge badge-${badge}" style="margin-left:6px">
                    ${d.stage}
                </span>
            </li>
        `;
    });

    html += `
            </ul>
            <div style="margin-top:10px;font-size:12px;color:#666">
                Please verify before proceeding.
            </div>
        </div>
    `;

    frappe.msgprint({
        title: "Candidate Already Mapped",
        message: html,
        indicator: "orange"
    });
}

function show_candidate_suggestions(frm) {
    // Get job opening name directly from the field (now contains the exact name)
    let job_opening_name = frm.doc.job_opening_title;
    
    if (!job_opening_name) {
        frappe.msgprint({
            title: "Job Opening Required",
            message: "Please select a job opening first to get candidate suggestions.",
            indicator: "orange"
        });
        return;
    }
    
    // Get already added candidates from child table (works for both saved and unsaved)
    let existing_candidates = [];
    if (frm.doc.table_akka && frm.doc.table_akka.length > 0) {
        existing_candidates = frm.doc.table_akka
            .filter(row => row.candidate_name)
            .map(row => row.candidate_name);
    }
    
    // Also get from database if document is saved
    if (!frm.is_new() && frm.doc.name) {
        // Fetch candidates from database and merge
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "DKP_JobApplication_Child",
                filters: {"parent": frm.doc.name},
                fields: ["candidate_name"]
            },
            async: false,
            callback: function(r) {
                if (r.message) {
                    const db_candidates = r.message.map(row => row.candidate_name);
                    existing_candidates = [...new Set([...existing_candidates, ...db_candidates])];
                }
            }
        });
    }
    
    // Fetch matching candidates - use the exact name of the job opening
    frappe.call({
        method: "btw_recruitment.btw_recruitment.doctype.dkp_job_application.dkp_job_application.get_matching_candidates",
        args: {
            job_opening_name: job_opening_name,  // Use exact name
            existing_candidates: existing_candidates
        },
        callback: function(r) {
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
            show_candidates_dialog(frm, candidates, criteria);
        }
    });
}

function show_candidates_dialog(frm, candidates, criteria) {
    let selected_candidates = [];
    
    // Build HTML for candidates list
    let candidates_html = `
        <div style="max-height: 500px; overflow-y: auto;">
            <div class="mb-3 p-2" style="background: #f8f9fa; border-radius: 4px;">
                <strong>Matching Criteria:</strong><br>
                <small>
                    Designation: ${criteria.designation || "Any"} | 
                    Experience: ${criteria.min_experience || 0}-${criteria.max_experience || "∞"} years |
                    Location: ${criteria.location || "Any"}
                </small>
            </div>
            <div class="candidates-list">
    `;
    
    candidates.forEach((candidate, index) => {
        const matchPercentage = Math.min(100, candidate.match_score);
        const matchColor = matchPercentage >= 70 ? "#28a745" : matchPercentage >= 50 ? "#ffc107" : "#17a2b8";
        const is_no_poach = candidate.is_no_poach || false;
        const cardBorderColor = is_no_poach ? "#ffc107" : "#dee2e6";
        const cardBgColor = is_no_poach ? "#fffbf0" : "#fff";
        
        candidates_html += `
            <div class="candidate-card mb-3 p-3" style="border: 2px solid ${cardBorderColor}; border-radius: 6px; background: ${cardBgColor};">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-2">
                            <input type="checkbox" class="candidate-checkbox mr-2" 
                                   data-candidate="${candidate.name}" 
                                   id="candidate-${index}"
                                   ${is_no_poach ? 'disabled' : ''}>
                            <label for="candidate-${index}" style="margin: 0; cursor: ${is_no_poach ? 'not-allowed' : 'pointer'};">
                                <strong>${candidate.candidate_name || candidate.name}</strong>
                            </label>
                            ${is_no_poach ? `
                                <span class="badge badge-warning ml-2" style="background: #ffc107; color: #000; padding: 4px 8px; border-radius: 4px; font-size: 0.75em;">
                                    🚫 No-Poach
                                </span>
                            ` : ''}
                        </div>
                        <div class="ml-4" style="font-size: 0.9em; color: #6c757d;">
                            <div><strong>Designation:</strong> ${candidate.current_designation || "-"}</div>
                            <div><strong>Experience:</strong> ${candidate.total_experience_years || 0} years</div>
                            <div><strong>Location:</strong> ${candidate.current_location || "-"}</div>
                            <div><strong>Skills:</strong> ${candidate.skills_tags || candidate.primary_skill_set || "-"}</div>
                            ${candidate.key_certifications ? `<div><strong>Certifications:</strong> ${candidate.key_certifications}</div>` : ""}
                        </div>
                        <div class="ml-4 mt-2">
                            <small style="color: #6c757d;">
                                <strong>Match Reasons:</strong> ${candidate.match_reasons.join(", ")}
                            </small>
                            ${is_no_poach ? `
                                <div class="mt-1">
                                    <small style="color: #856404;">
                                        <strong>⚠️ No-Poach:</strong> Currently employed at <b>${candidate.no_poach_company || "Unknown Company"}</b>
                                    </small>
                                </div>
                            ` : ''}
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
    });
    
    candidates_html += `
            </div>
        </div>
    `;
    
    let d = new frappe.ui.Dialog({
        title: `Matching Candidates (${candidates.length} found)`,
        fields: [
            {
                fieldtype: "HTML",
                options: candidates_html
            }
        ],
        primary_action_label: "Add Selected",
        primary_action: () => {
            // Get selected candidates and filter out no-poach
            selected_candidates = [];
            let blocked_candidates = [];
            
            d.$wrapper.find('.candidate-checkbox:checked').each(function() {
                const candidate_name = $(this).data('candidate');
                const candidate = candidates.find(c => c.name === candidate_name);
                
                if (candidate) {
                    if (candidate.is_no_poach) {
                        blocked_candidates.push({
                            name: candidate.candidate_name || candidate.name,
                            reason: "no-poach",
                            company: candidate.no_poach_company
                        });
                    } else {
                        selected_candidates.push(candidate_name);
                    }
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
            
            // Add candidates to child table
            add_candidates_to_table(frm, selected_candidates);
            d.hide();
        },
        secondary_action_label: "Close",
        secondary_action: () => d.hide()
    });
    
    d.show();
}

function add_candidates_to_table(frm, candidate_names) {
    if (!candidate_names || candidate_names.length === 0) return;
    
    // Add each candidate to the child table
    candidate_names.forEach(candidate_name => {
        let row = frm.add_child("table_akka");
        frappe.model.set_value(row.doctype, row.name, "candidate_name", candidate_name);
    });
    
    frm.refresh_field("table_akka");
    
    frappe.show_alert({
        message: `${candidate_names.length} candidate(s) added successfully`,
        indicator: "green"
    }, 3);
}
