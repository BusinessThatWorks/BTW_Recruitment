let dashboard_filters = {
    from_date: null,
    to_date: null,
    stage: null 
};
const stageOptions = ["In Review", "Screening", "Interview", "Offered", "No Assigned Stage"];

let applications_pagination = {
    limit: 10,
    offset: 0,
    total: 0,
    current_page: 1
};
const stageColors = {
    "In Review": "#D9825B",     // muted terracotta
    "Screening": "#7F78C8",     // dusty purple
    "Interview": "#6FAFD6",     // calm steel blue
    "Interview in Progress": "#6FAFD6",     // calm steel blue
    "Shortlisted For Interview": "#9B7EDE", // light purple
    "Selected": "#4CAF50",      // green
    "Offered": "#6FBF8F",       // muted emerald mint
    "Rejected": "#D16B6B",      // soft brick red
    "Offer Drop": "#8E8E8E",     // warm graphite grey
    "Joined": "#2E7D32"         // dark green
};

const priorityColors = {
    "Critical": "#D75A5A",     // matte coral red
    "High": "#E39A5F"          // warm amber pastel
};
let candidate_departments_loaded = false;
let jobs_departments_loaded = false;
let jobs_table_state = { limit: 20, offset: 0 };
let jobs_table_filters = { company_name: null, designation: null, department: null, recruiter: null, status: null,priority: null,ageing_from:null,ageing_to:null };
let job_applications_table_state = { limit: 20, offset: 0 };
let job_applications_table_filters = { company_name: null, job_opening_title: null, designation: null };
let company_table_state = { limit: 20, offset: 0 };
let company_filters = {
    company_name: null,
    client_type: null,
    industry: null,
    state: null,
    city: null,
    client_status: null
};


frappe.pages['hr-recruitment-dashb'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'HR Recruitment Dashboard',
        single_column: true
    });
$(frappe.render_template("hr_recruitment_dashb")).appendTo(page.body);
// page.add_field({
//     label: 'From Date',
//     fieldtype: 'Date',
//     fieldname: 'from_date',
//     change() {
//         dashboard_filters.from_date = this.value  || null;
//         on_global_date_change();
//     }
// });

// page.add_field({
//     label: 'To Date',
//     fieldtype: 'Date',
//     fieldname: 'to_date',
//     change() {
//         dashboard_filters.to_date = this.value  || null;
//         on_global_date_change();
//     }
// });
// page.add_field({
//     label: 'Clear Date Filter', // No label, just a button
//     fieldtype: 'Button',
//     fieldname: 'clear_date_filter',
//     options: 'Clear Dates',
//     click() {
//         // Clear the input fields
//         $('input[data-fieldname="from_date"]').val('');  
//         $('input[data-fieldname="to_date"]').val('');

//         // Reset the dashboard filter values
//         dashboard_filters.from_date = null;
//         dashboard_filters.to_date = null;

//         // Refresh the currently active tab
//         on_global_date_change();
//     }
// });
$(document).ready(function() {
    const active_tab = $("#hr-dashboard-tabs .nav-link.active").data("tab");
    if(active_tab === "candidates") {
        // refresh_dashboard();
        load_candidate_table();
    }
});
$(document).on(
    "change",
    "#candidate-from-date, #candidate-to-date, #jobs-from-date, #jobs-to-date, #company-from-date, #company-to-date",
    function () {
        const $tab = $(this).closest(".tab-pane");

        dashboard_filters.from_date =
            $tab.find('input[type="date"][id$="from-date"]').val() || null;

        dashboard_filters.to_date =
            $tab.find('input[type="date"][id$="to-date"]').val() || null;

        on_global_date_change();
    }
);
$(document).on(
    "click",
    "#candidate-clear-dates, #jobs-clear-dates, #company-clear-dates",
    function () {
        const $tab = $(this).closest(".tab-pane");

        $tab.find('input[type="date"]').val("");

        dashboard_filters.from_date = null;
        dashboard_filters.to_date = null;

        on_global_date_change();
    }
);

function on_global_date_change() {
    const active_tab = $("#hr-dashboard-tabs .nav-link.active").data("tab");

    // if (active_tab === "overall") {
    //     refresh_dashboard();
    // }

    if (active_tab === "candidates") {
        candidate_table_state.offset = 0;
        load_candidate_table();
        refresh_dashboard();
    }
    if (active_tab === "jobs") {
        jobs_table_state.offset = 0;
        load_job_kpis();
        load_jobs_table();
        // load_recruiter_filter_options();
    }
    
    if (active_tab === "company") { 
        company_table_state.offset = 0; 
        load_company_table(); 
        load_company_kpis();
        load_client_type_chart();
        load_industry_chart();
    }
}

$(document).on("click", "#hr-dashboard-tabs .nav-link", function () {
    const tab = $(this).data("tab");

    $("#hr-dashboard-tabs .nav-link").removeClass("active");
    $(this).addClass("active");

    $(".tab-pane").removeClass("active");
    $(`#tab-${tab}`).addClass("active");

    if (tab === "overall") {
        refresh_dashboard();
    }

    if (tab === "candidates") {
        load_candidates_tab();
        load_candidate_table();
    }
    if (tab === "jobs") {   
        load_job_kpis();
        load_jobs_department_options();
        load_jobs_table();
        init_recruiter_filter();
        // load_recruiter_filter_options()
    }
    if (tab === "company") {
        load_company_table();
        load_company_kpis();
        load_client_type_chart();
        load_industry_chart();
    }
});
let recruiter_control = null;

function init_recruiter_filter() {
    if (recruiter_control) return;

    recruiter_control = frappe.ui.form.make_control({
        parent: $("#filter-job-recruiter"),
        df: {
            fieldtype: "MultiSelectList",
            label: "Assigned Recruiter",
            fieldname: "recruiter",
            get_data(txt) {
                return frappe.db.get_list("User", {
                    fields: ["name", "full_name", "email"],
                    filters: {
                        enabled: 1,
                        role_profile_name: "DKP Recruiter",
                        name: ["like", `%${txt}%`]
                    },
                    limit: 20
                }).then(res => {
                    return res.map(u => ({
                        value: u.name, // User name (email)
                        label: `${u.full_name || u.name} (${u.name})`
                    }));
                });
            },
            onchange() {
                jobs_table_filters.recruiter = recruiter_control.get_value();
                jobs_table_state.offset = 0;
                load_jobs_table();
            }
        },
        render_input: true
    });
}


// Helper function to apply candidate filters
function apply_candidate_filters() {
    candidate_table_filters.candidate_name_search =
        $("#candidate-name-search").val() || null;

    candidate_table_filters.search_text =
        $("#candidate-search").val() || null;

    candidate_table_filters.department =
        $("#filter-department").val() || null;

    candidate_table_filters.current_designation =
        $("#filter-designation").val() || null;

    candidate_table_filters.min_experience =
        $("#filter-min-exp").val() || null;

    candidate_table_filters.max_experience =
        $("#filter-max-exp").val() || null;

    candidate_table_state.offset = 0;
    load_candidate_table();
}

$(document).on("click", "#apply-candidate-filters", function () {
    apply_candidate_filters();
});

// Live filtering for candidate filters
$(document).on("change", "#filter-department, #filter-designation, #filter-min-exp, #filter-max-exp", function() {
    apply_candidate_filters();
});

// Debounced live filtering for text inputs
let candidate_filter_timeout;
$(document).on("keyup", "#candidate-name-search, #candidate-search, #filter-min-exp, #filter-max-exp,#filter-designation", function() {
    clearTimeout(candidate_filter_timeout);
    candidate_filter_timeout = setTimeout(function() {
        apply_candidate_filters();
    }, 500); // Wait 500ms after user stops typing
});
$(document).on("click", "#clear-candidate-filters", function () {
    $("#candidate-name-search").val("");
    $("#candidate-search").val("");
    $("#filter-department").val("");
    $("#filter-designation").val("");
    $("#filter-min-exp").val("");
    $("#filter-max-exp").val("");

    candidate_table_filters.candidate_name_search = null;
    candidate_table_filters.search_text = null;
    candidate_table_filters.department = null;
    candidate_table_filters.current_designation = null;
    candidate_table_filters.min_experience = null;
    candidate_table_filters.max_experience = null;

    candidate_table_state.offset = 0;
    load_candidate_table();
});
$(document).on("click", 'a[data-tab="jobs"]', () => {
    console.log("Jobs tab clicked");

    load_jobs_department_options();
    load_jobs_table();
    init_recruiter_filter();
    // load_recruiter_filter_options();
});

// Helper function to apply job filters
function apply_job_filters() {
    jobs_table_filters.company_name = $("#filter-job-company").val() || null;
    jobs_table_filters.designation = $("#filter-job-title").val() || null;
    jobs_table_filters.department = $("#filter-job-department").val() || null;
    // jobs_table_filters.recruiter = $("#filter-job-recruiter").val() || null;
    jobs_table_filters.status = $("#filter-job-status").val() || null;
     // Multi-select recruiter value as JSON array
    let recruiter_field = $("#filter-job-recruiter").get(0);
    let selected_recruiters = [];

    if (recruiter_field && recruiter_field.frappe_multi_select) {
        selected_recruiters = recruiter_field.frappe_multi_select.get_values(); // always array
    }

    jobs_table_filters.recruiter = selected_recruiters.length ? JSON.stringify(selected_recruiters) : null;
    jobs_table_filters.priority = $("#filter-job-priority").val() || null;  // <-- new
    jobs_table_filters.ageing_from = $("#filter-job-ageing-from").val() || null;  // <-- new
    jobs_table_filters.ageing_to = $("#filter-job-ageing-to").val() || null;

    jobs_table_state.offset = 0;
    load_jobs_table();
}

$("#apply-job-filters").click(() => {
    apply_job_filters();
});

// Live filtering for job filters
$(document).on("change", "#filter-job-company, #filter-job-department, #filter-job-status, #filter-job-recruiter, #filter-job-priority, #filter-job-ageing-from, #filter-job-ageing-to", function() {
    apply_job_filters();
});


// Debounced live filtering for text inputs
let job_filter_timeout;
$(document).on("keyup", "#filter-job-company, #filter-job-title", function() {
    clearTimeout(job_filter_timeout);
    job_filter_timeout = setTimeout(function() {
        apply_job_filters();
    }, 500);
});

$("#clear-job-filters").click(() => {
    $("#filter-job-company").val("");
    $("#filter-job-title").val("");
    $("#filter-job-department").val("");
    $("#filter-job-status").val("");
    $("#filter-job-priority").val("");
    $("#filter-job-ageing-from").val("");
    $("#filter-job-ageing-to").val("");

    if (recruiter_control) {
        recruiter_control.set_value([]);
    }

    jobs_table_filters = {
        company_name: null,
        designation: null,
        department: null,
        recruiter: null,
        status: null,
        priority: null,
        ageing_from: null,
        ageing_to: null
    };

    jobs_table_state.offset = 0;
    load_jobs_table();
});


$(document).on("click", 'a[data-tab="company"]', function () {
    console.log("Company tab opened");
    load_company_table();
});
// Helper function to apply company filters
function apply_company_filters() {
    company_filters.company_name = $("#filter-company-name").val() || null;
    company_filters.client_type = $("#filter-company-type").val() || null;
    company_filters.industry = $("#filter-company-industry").val() || null;
    company_filters.state = $("#filter-company-state").val() || null;
    company_filters.city = $("#filter-company-city").val() || null;
    company_filters.client_status = $("#filter-company-status").val() || null;

    company_table_state.offset = 0;
    load_company_table();
}

$("#apply-company-filters").click(() => {
    apply_company_filters();
});

// Live filtering for company filters
$(document).on("change","#filter-company-name, #filter-company-type, #filter-company-status,  #filter-company-city", function() {
    apply_company_filters();
});

// Debounced live filtering for text inputs
let company_filter_timeout;
$(document).on("keyup", "#filter-company-name, #filter-company-industry, #filter-company-state, #filter-company-city", function() {
    clearTimeout(company_filter_timeout);
    company_filter_timeout = setTimeout(function() {
        apply_company_filters();
    }, 500);
});

// Clear filters
$("#clear-company-filters").click(() => {
    $("#filter-company-name").val("");
    $("#filter-company-type").val("");
    $("#filter-company-industry").val("");
    $("#filter-company-state").val("");
    $("#filter-company-city").val("");
    $("#filter-company-status").val("");

    company_filters = {
        company_name: null, client_type: null, industry: null,
        state: null, city: null, client_status: null
    };

    company_table_state.offset = 0;
    load_company_table();
});
    load_kpis();
};
function refresh_dashboard() {
    $("#hr-kpi-cards").empty();
    $("#pipeline-section").empty();
    $("#department-section").empty();
    $("#applications-section").empty();
    $("#urgent-openings-section").empty();

    applications_pagination.offset = 0;
    applications_pagination.current_page = 1;

    load_kpis();
}

function load_candidates_tab() {
    $("#candidates-table").empty();

    candidate_table_state.offset = 0;
    load_kpis();
    load_candidate_department_options();
    load_candidate_table();
}
function load_jobs_department_options() {
    if (jobs_departments_loaded) return;

    frappe.call({
        method: "frappe.client.get_list",
        args: { 
            doctype: "DKP_Department",
            fields: ["name"],
            limit_page_length: 1000
        },
        callback(r) {
            if (r.message) {
                const $dept = $("#filter-job-department");
                $dept.empty().append('<option value="">All</option>');
                r.message.forEach(d => {
                    $dept.append(`<option value="${d.name}">${d.name}</option>`);
                });
                jobs_departments_loaded = true;
            }
        }
    });
}



function load_kpis() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: {
            report_name: "HR Recruitment KPIs",
            filters: {
                from_date: dashboard_filters.from_date,
                to_date: dashboard_filters.to_date
            }
        },
        callback: function(r) {
            if (!r.message || !r.message.result) return;

            // KPIs
            render_kpi_cards(r.message.result[0]);

            // Charts & Tables (each owns its section)
            if (r.message.chart) {
                render_stage_chart(r.message.chart);
            }

            render_department_pie_chart();
            render_urgent_openings_table();
        }
    });
}
function render_kpi_cards(data) {
    const cards = [
        {
            label: "Total Candidates",
            value: data.total_candidates,
            link: "/app/dkp_candidate"
        },
        {
            label: "Blacklisted Candidates",
            value: data.blacklisted_candidates,
            link: "/app/dkp_candidate?blacklisted=Yes"
        },
        
    ];

    const $row = $("#hr-kpi-cards");
    $row.empty();

    cards.forEach(card => {
        $(`
            <div class="kpi-col">
                <a href="${card.link}" class="kpi-link">
                    <div class="card kpi-card">
                        <div class="kpi-value">${card.value}</div>
                        <div class="kpi-label">${card.label}</div>
                    </div>
                </a>
            </div>
        `).appendTo($row);
    });
}
function render_stage_chart(chart_data) {
    const $section = $("#pipeline-section");
    $section.empty();

    const labels = chart_data.data.labels;
    const values = chart_data.data.datasets[0].values;

    const datasets = labels.map((label, index) => ({
        name: label,
        values: labels.map((_, i) => i === index ? values[index] : 0),
        chartType: "bar",
        color: stageColors[label] || "#cccccc"
    }));

    const updated_chart_data = {
        type: "bar",
        data: {
            labels: labels,
            datasets: datasets
        },
        barOptions: {
            stacked: true,
            spaceRatio: 0.5
        }
    };

    const chart_container = $(`
        <div class="card" style="padding:16px; margin-top: 20px;">
            <h4>Candidate Pipeline</h4>
            <div id="stage-chart"></div>
        </div>
    `);

    $section.append(chart_container);

    frappe.utils.make_chart("#stage-chart", updated_chart_data);
}



function render_department_pie_chart() {
    const $section = $("#department-section");
    $section.empty();

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidates_by_department",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
        },
        callback: function(r) {
            if (!r.message || r.message.length === 0) {
                $section.append(`
                    <div class="card p-3 text-muted text-center">
                        No department data
                    </div>
                `);
                return;
            }

            const labels = r.message.map(d => d.department);
            const values = r.message.map(d => d.count);

            const chart_container = $(`
                <div class="card" style="padding:16px; margin-top: 20px;">
                    <h4>Candidates by Department</h4>
                    <div id="department-pie-chart"></div>
                </div>
            `);

            $section.append(chart_container);

            frappe.utils.make_chart("#department-pie-chart", {
                data: {
                    labels: labels,
                    datasets: [{ name: "Candidates", values }]
                },
                type: "pie"
            });
        }
    });
}
function render_urgent_openings_table(callback) {
    const $section = $("#urgent-openings-section");
    $section.empty();

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_urgent_openings",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date
        },
        callback: function (r) {

            // Empty state
            if (!r.message || r.message.length === 0) {
                const empty_card = $(`
                    <div class="card" style="margin-top:20px; padding:16px;">
                        <h4>🚨 Urgent Openings</h4>
                        <div class="text-muted text-center">
                            No urgent openings
                        </div>
                    </div>
                `);

                $section.append(empty_card);
                if (callback) callback();
                return;
            }

            const table_container = $(`
                <div class="card" style="margin-top:20px; padding:16px; margin-bottom: 20px;">
                    <h4>🚨 Urgent Openings</h4>
                    <table class="table table-bordered">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Job Opening</th>
                                <th>Company</th>
                                <th>Priority</th>
                                <th>Positions</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="urgent-openings-body"></tbody>
                    </table>
                </div>
            `);

            $section.append(table_container);

            const tbody = table_container.find("#urgent-openings-body");

            r.message.forEach((row, index) => {
                tbody.append(`
                    <tr>
                        <td>${index + 1}</td>
                        <td>
                            <a href="/app/dkp_job_opening/${row.name}">
                                ${row.job_title || row.name}
                            </a>
                        </td>
                        <td>${row.company_name || "-"}</td>
                        <td>
                            <span style="
                                padding:4px 10px;
                                border-radius:12px;
                                color:#fff;
                                font-weight:600;
                                background:${priorityColors[row.priority] || "#6c757d"};
                            ">
                                ${row.priority || "-"}
                            </span>
                        </td>
                        <td>${row.number_of_positions || "0"}</td>
                        <td>${row.status || "-"}</td>
                    </tr>
                `);
            });

            if (callback) callback();
        }
    });
}
// adding candidate table state and filters
const candidate_table_state = {
    limit: 20,
    offset: 0
};

const candidate_table_filters = {
    candidate_name_search: null,
    department: null,
    current_designation: null,
    min_experience: null,
    max_experience: null,
    search_text: null
};
function load_candidate_department_options() {
     if (candidate_departments_loaded) return;
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "DKP_Department",
            fields: ["name"],
            limit_page_length: 1000
        },
        callback(r) {
            if (r.message) {
                const $dept = $("#filter-department");
                r.message.forEach(d => {
                    $dept.append(
                        `<option value="${d.name}">${d.name}</option>`
                    );
                });
                candidate_departments_loaded = true;
            }
        }
    });
}
function load_candidate_table() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidate_table",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
            limit: candidate_table_state.limit,
            offset: candidate_table_state.offset,
            department: candidate_table_filters.department,
            current_designation: candidate_table_filters.current_designation,
            min_experience: candidate_table_filters.min_experience,
            max_experience: candidate_table_filters.max_experience,
            search_text: candidate_table_filters.search_text,
            candidate_name_search: candidate_table_filters.candidate_name_search
        },
        callback(r) {
            if (r.message) {
                render_candidate_table(r.message.data, r.message.total);
            }
        }
    });
}
function render_candidate_table(data, total) {
    const $container = $("#candidates-table");
    $container.empty();

    // ---------------- Table ----------------
    const table = $(`
        <table class="table table-bordered table-striped table-hover">
            <thead>
                <tr>
                    <th>Candidate</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Experience (Yrs)</th>
                    <th>Skills(tags)</th>
                    <th>Primary Skill</th>
                    <th>Secondary Skill</th>
                    <th>Certifications</th>
                    <th>Created On</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    if (!data || data.length === 0) {
        table.find("tbody").append(`
            <tr>
                <td colspan="8" class="text-center text-muted">
                    No candidates found
                </td>
            </tr>
        `);
    } else {
        data.forEach(d => {
            table.find("tbody").append(`
                <tr>
                    <td>
                        <a href="/app/dkp_candidate/${d.name}">
                            ${d.candidate_name || d.name}
                        </a>
                    </td>
                    <td>${d.department || "-"}</td>
                    <td>${d.current_designation || "-"}</td>
                    <td>${d.total_experience_years ?? "-"}</td>
                    <td>${d.skills_tags || "-"}</td>
                    <td>${d.primary_skill_set || "-"}</td>
                    <td>${d.secondary_skill_set || "-"}</td>
                    <td>${d.key_certifications || "-"}</td>
                    <td>${frappe.datetime.str_to_user(d.creation)}</td>
                </tr>
            `);
        });
    }

    $container.append(table);

    // ---------------- Pagination ----------------
    const total_pages = Math.ceil(total / candidate_table_state.limit);
    const current_page =
        Math.floor(candidate_table_state.offset / candidate_table_state.limit) + 1;

    const pagination = $(`
        <div class="mt-2 d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-primary" id="candidate-prev">Prev</button>
            <span>Page ${current_page} of ${total_pages || 1}</span>
            <button class="btn btn-sm btn-primary" id="candidate-next">Next</button>
        </div>
    `);

    $container.append(pagination);

    $("#candidate-prev")
        .prop("disabled", candidate_table_state.offset === 0)
        .click(() => {
            candidate_table_state.offset -= candidate_table_state.limit;
            load_candidate_table();
        });

    $("#candidate-next")
        .prop("disabled", current_page >= total_pages)
        .click(() => {
            candidate_table_state.offset += candidate_table_state.limit;
            load_candidate_table();
        });
}


function get_ageing_days(creation) {
    if (!creation) return "-";

    const created_on = frappe.datetime.str_to_obj(creation);
    const today = frappe.datetime.now_date(); // yyyy-mm-dd
    const today_obj = frappe.datetime.str_to_obj(today);

    const diff_ms = today_obj - created_on;
    const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24));

    return diff_days >= 0 ? diff_days : 0;
}
let recruiter_loaded = false;

// function load_recruiter_filter_options() {
//     if (recruiter_loaded) return;
//     recruiter_loaded = true;

//     frappe.call({
//         method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_recruiter_filter_options",
//         callback(r) {
//             const $rec = $("#filter-job-recruiter");
//             $rec.find("option:not(:first)").remove();

//             r.message.forEach(u => {
//                 $rec.append(
//                     `<option value="${u.name}">${u.full_name || u.name}</option>`
//                 );
//             });
//         }
//     });
// }


function load_job_kpis() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: {
            report_name: "HR Recruitment – Jobs KPIs",
            filters: {
                from_date: dashboard_filters.from_date,
                to_date: dashboard_filters.to_date
            }
        },
        callback(r) {
            if (r.message) {
                render_job_kpi_cards(r.message.result[0]);
                render_job_charts(r.message.chart);
            }
        }
    });
}
function render_job_kpi_cards(data) {
    // Define filters info
    const kpiFilters = {
        total_jobs: "Count of job openings with status = Open OR Hold",
        total_positions: "Total number of positions in job openings with status = Open",
        active_jobs: "Count of active job openings where status = Open"
    };

    // Cards definition with key for tooltip
    const cards = [
        {
            key: "total_jobs",
            label: "Total Job Openings",
            value: data.total_jobs,
            link: "/app/dkp_job_opening?status=Open"
        },
        {
            key: "total_positions",
            label: "Total Open Positions",
            value: data.total_positions,
            link: "/app/dkp_job_opening?status=Open"
        },
        // {
        //     key: "active_jobs",
        //     label: "Active Jobs",
        //     value: data.active_jobs,
        //     link: "/app/dkp_job_opening?status=Open"
        // }
    ];

    const $row = $("#job-kpi-cards");
    $row.empty();

    cards.forEach(card => {
        const cardHtml = `
            <div class="kpi-col">
                ${card.link ? `
                    <a href="${card.link}" class="kpi-link">
                        <div class="card kpi-card">
                            <div class="kpi-value">${card.value}</div>
                            <div class="kpi-label">
                                ${card.label}
                                <span class="kpi-info" data-info="${kpiFilters[card.key]}">ℹ️</span>
                            </div>
                        </div>
                    </a>
                ` : `
                    <div class="card kpi-card kpi-card-disabled">
                        <div class="kpi-value">${card.value}</div>
                        <div class="kpi-label">
                            ${card.label}
                            <span class="kpi-info" data-info="${kpiFilters[card.key]}">ℹ️</span>
                        </div>
                    </div>
                `}
            </div>
        `;
        $(cardHtml).appendTo($row);
    });

    // Add styles once
    if (!$("#job-kpi-card-style").length) {
        $("<style>")
            .prop("type", "text/css")
            .attr("id", "job-kpi-card-style")
            .html(`
                #job-kpi-cards {
                    display: flex;
                    gap: 12px;
                    padding: 16px;
                }
                .kpi-col {
                    flex: 1;
                }
                .kpi-link {
                    text-decoration: none;
                    color: inherit;
                    display: block;
                    height: 100%;
                }
                .kpi-card {
                    padding: 14px;
                    text-align: center;
                    border-radius: 8px;
                    background: #ffffff;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                    height: 100%;
                    cursor: pointer;
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                    position: relative;
                }
                .kpi-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 10px rgba(0,0,0,0.12);
                }
                .kpi-card-disabled {
                    cursor: default;
                    opacity: 0.85;
                }
                .kpi-value {
                    font-size: 20px;
                    font-weight: 600;
                }
                .kpi-label {
                    margin-top: 6px;
                    font-size: 13px;
                    color: #6c7680;
                }

                /* Tooltip for info icon */
                .kpi-info {
                    margin-left: 4px;
                    font-size: 12px;
                    color: #8d99a6;
                    cursor: pointer;
                    position: relative;
                }

                .kpi-info::after {
                    content: attr(data-info);
                    position: absolute;
                    bottom: 125%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #111827;
                    color: #fff;
                    font-size: 11px;
                    padding: 6px 8px;
                    border-radius: 6px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.15s ease;
                    z-index: 10;
                }

                .kpi-info:hover::after {
                    opacity: 1;
                }
            `)
            .appendTo("head");
    }
}

function normalize_status(status) {
    if (!status) return "";

    const s = status.toLowerCase().trim();

    if (s === "open") return "open";
    if (s === "hold") return "hold";

    if (s === "closed – hired" || s === "closed - hired")
        return "closed_hired";

    if (s === "closed – cancelled" || s === "closed - cancelled")
        return "closed_cancelled";

    return "other";
}
function render_job_charts(chart) {
	const labels = chart.data.labels;
    const values = chart.data.datasets[0].values;

    const datasets = labels.map((label, index) => {
        const key = normalize_status(label);

        return {
            name: label,
            values: labels.map((_, i) => i === index ? values[index] : 0),
            chartType: "bar",
        };
    });

    new frappe.Chart("#job-status-chart", {
        title: "Job Status Distribution",
        data: {
            labels,
            datasets
        },
        type: "donut",
        height: 250
    });

    // Department-wise chart (if separate data needed)
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_department_job_data",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date
        },
        callback(r) {
        if (!r.message || !r.message.length) return;

        const dept_data = r.message;

        const labels = dept_data.map(d => d.department);
        const values = dept_data.map(d => d.count);

        const datasets = labels.map((label, index) => ({
            name: label,
            values: labels.map((_, i) => i === index ? values[index] : 0),
            chartType: "bar"
            // color optional – frappe will auto assign if omitted
        }));

        new frappe.Chart("#job-department-chart", {
            title: "Department-wise Job Openings",
            data: {
                labels: labels,
                datasets: datasets
            },
            type: "bar",
            height: 250,
            barOptions: {
                stacked: true,      // important (same as pipeline chart)
                spaceRatio: 0.7
            }
        });
    }
    });
}
function load_jobs_table() {
    console.log("Loading Jobs Table...", jobs_table_filters, jobs_table_state);

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
            limit: jobs_table_state.limit,
            offset: jobs_table_state.offset,
            company_name: jobs_table_filters.company_name,
            designation: jobs_table_filters.designation,
            department: jobs_table_filters.department,
            
            status: jobs_table_filters.status,
            priority: jobs_table_filters.priority,
            ageing_from: jobs_table_filters.ageing_from,
            ageing_to: jobs_table_filters.ageing_to,
            recruiter: jobs_table_filters.recruiter
        },
        callback(r) {
            console.log("Jobs API Response:", r);

            if (r.message) {
                render_jobs_table(r.message.data, r.message.total);
            } else {
                render_jobs_table([], 0);
            }
        }
    });
}

function render_jobs_table(data, total) {
    console.log("render_jobs_table called with data:", data);
    const $container = $("#jobs-table");
    $container.empty();

    const table = $(`
        <table class="table table-bordered table-striped table-hover">
            <thead>
                <tr>
                    <th>Job Opening</th>
                    <th>Company</th>
                    <th>Designation</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>No. of Positions</th>
                    <th>Created On</th>
                    <th>Ageing (Days)</th>

                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    if (!data || !data.length) {
        table.find("tbody").append(`
            <tr><td colspan="8" class="text-center text-muted">No job openings found</td></tr>
        `);
    } else {
        data.forEach(d => {
            const ageing = get_ageing_days(d.creation);
            table.find("tbody").append(`
                <tr>
                    <td><a href="/app/dkp_job_opening/${d.name}">${d.name || "-"}</a></td>
                    <td>${d.company_name || "-"}</td>
                    <td>${d.designation || "-"}</td>
                    <td>${d.department || "-"}</td>
                    <td>${d.status || "-"}</td>
                    <td>
                        <span style="
                            padding:4px 10px;
                            border-radius:12px;
                            color:#fff;
                            font-weight:600;
                            background:${priorityColors[d.priority] || "#6c757d"};
                        ">
                            ${d.priority || "-"}
                        </span>
                    </td>
                    <td>${d.number_of_positions || "-"}</td>
                    <td>${moment(d.creation).format("DD-MM-YYYY hh:mm A")}</td>

                    <td>${ageing}</td>
                </tr>
            `);
        });
    }

    $container.append(table);

    // Pagination
    const total_pages = Math.ceil(total / jobs_table_state.limit);
    const current_page = Math.floor(jobs_table_state.offset / jobs_table_state.limit) + 1;

    const pagination = $(`
        <div class="mt-2 d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-primary" id="jobs-prev">Prev</button>
            <span>Page ${current_page} of ${total_pages || 1}</span>
            <button class="btn btn-sm btn-primary" id="jobs-next">Next</button>
        </div>
    `);

    $container.append(pagination);

    $("#jobs-prev")
        .prop("disabled", jobs_table_state.offset === 0)
        .click(() => {
            jobs_table_state.offset -= jobs_table_state.limit;
            load_jobs_table();
        });

    $("#jobs-next")
        .prop("disabled", current_page >= total_pages)
        .click(() => {
            jobs_table_state.offset += jobs_table_state.limit;
            load_jobs_table();
        });
}
// ---------------- KPIs ----------------
function load_company_kpis() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: {
            report_name: "Company Recruitment KPIs",
            filters: {
                from_date: dashboard_filters.from_date,
                to_date: dashboard_filters.to_date
            }
        },
        callback(r) {
            if(r.message) {
				console.log(r.message.result);
				
                render_company_kpi_cards(r.message.result);
            }
        }
    });
}
function render_company_kpi_cards(data) {
    const kpiLinks = {
        "Total Clients": "/app/dkp_company",
        "Active Clients": "/app/dkp_company?client_status=Active",
        "Inactive Clients": "/app/dkp_company?client_status=Inactive",
        "Clients with Open Jobs": "/app/dkp_job_opening?status=Open",
    };

    const $row = $("#company-kpi-cards");
    $row.empty();

    data.forEach(item => {
        const link = kpiLinks[item.kpi];

        $(`
            <div class="kpi-col">
                ${link ? `
                    <a href="${link}" class="kpi-link">
                        <div class="card kpi-card">
                            <div class="kpi-value">${item.value}</div>
                            <div class="kpi-label">${item.kpi}</div>
                        </div>
                    </a>
                ` : `
                    <div class="card kpi-card">
                        <div class="kpi-value">${item.value}</div>
                        <div class="kpi-label">${item.kpi}</div>
                    </div>
                `}
            </div>
        `).appendTo($row);
    });
}

if (!$("#company-kpi-cards").length) {
        $("<style>")
            .prop("type", "text/css")
            .attr("id", "company-kpi-card-style")
            .html(`
				#company-kpi-cards {
            display: flex;
            gap: 12px;
            padding:16px;
        }
        .kpi-col {
            flex: 1;

        }
            .kpi-link {
    text-decoration: none;
    color: inherit;
    display: block;
    height: 100%;
}

.kpi-card {
    cursor: pointer;
}
		.kpi-card {
			padding: 12px;
				text-align: center;
							border-radius: 8px;
							background: #ffffff;
							box-shadow: 0 1px 4px rgba(0,0,0,0.08);
							height: 100%;
						}
						.kpi-value {
							font-size: 20px;
							font-weight: 600;
						}
						.kpi-label {
							margin-top: 6px;
							font-size: 13px;
							color: #6c7680;
						}
                            .kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0,0,0,0.12);
}
					`)							
		.appendTo("head");                
    }


// ---------------- Client Type Chart ----------------
function load_client_type_chart() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_client_type_distribution",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date
        },
        callback(r) {
            if(r.message) {
                const chart_data = r.message;
                new frappe.Chart("#client-type-chart", {
                    title: "Client Type Distribution",
                    data: chart_data.data,
                    type: "pie",
                    height: 300,
					// legend: {
					// 	position: "top"
					// }
                });
            }
        }
    });
}

// ---------------- Industry Chart ----------------
function load_industry_chart() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: {
            report_name: "Company Recruitment KPIs",
            filters: {
                from_date: dashboard_filters.from_date,
                to_date: dashboard_filters.to_date
            }
        },
        callback(r) {
            if (!r.message || !r.message.chart) return;

            const chart = r.message.chart;
            const labels = chart.data.labels;
            const values = chart.data.datasets[0].values;

            // ✅ Same proven pattern
            const datasets = labels.map((label, index) => ({
                name: label,
                values: labels.map((_, i) => i === index ? values[index] : 0),
                chartType: "bar"
            }));

            new frappe.Chart("#industry-chart", {
                title: "Industry-wise Client Count",
                data: {
                    labels,
                    datasets
                },
                type: "bar",
                height: 250,
                barOptions: {
                    stacked: true,
                    spaceRatio: 0.75
                }
            });
        }
    });
}
function load_company_table() {
    console.log("Loading Company Table...", company_filters, company_table_state);

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_companies",  
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
            limit_page_length: company_table_state.limit,
            limit_start: company_table_state.offset,
            ...company_filters
        },
        callback(r) {
            render_company_table(r.message.data, r.message.total);
        }
    });
}

// Render Table + Pagination
function render_company_table(data) {
    const $container = $("#company-table");
    $container.empty();

    const table = $(`
        <table class="table table-bordered table-striped table-hover">
            <thead>
                <tr>
                    <th>Company</th>
                    <th>Client Type</th>
                    <th>Industry</th>
                    <th>Location</th>
                    <th>Billing Email</th>
                    <th>Billing Phone</th>
                    <th>Status</th>
                    <th>Fee Type</th>
                    <th>Replacement</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    if (!data.length) {
        table.find("tbody").append(`
            <tr><td colspan="9" class="text-center text-muted">No companies found</td></tr>
        `);
    } else {
        data.forEach(d => {
            table.find("tbody").append(`
                <tr>
                    <td><a href="/app/dkp_company/${d.name}">${d.company_name}</a></td>
                    <td>${d.client_type || "-"}</td>
                    <td>${d.industry || "-"}</td>
                    <td>${d.city || "-"}, ${d.state || "-"}</td>
                    <td>${d.billing_mail || "-"}</td>
                    <td>${d.billing_number || "-"}</td>
                    <td>${d.client_status || "-"}</td>
                    <td>${d.standard_fee_type || "-"}</td>
                    <td>${d.replacement_policy_days || "-"}</td>
                </tr>
            `);
        });
    }

    $container.append(table);

    // Pagination like jobs
    const pagination = $(`
        <div class="mt-2 d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-primary" id="company-prev">Prev</button>
            <button class="btn btn-sm btn-primary" id="company-next">Next</button>
        </div>
    `);

    $("#company-prev")
        .prop("disabled", company_table_state.offset === 0)
        .click(() => { company_table_state.offset -= company_table_state.limit; load_company_table(); });

    $("#company-next")
        .prop("disabled", data.length < company_table_state.limit)
        .click(() => { company_table_state.offset += company_table_state.limit; load_company_table(); });

    $container.append(pagination);
}