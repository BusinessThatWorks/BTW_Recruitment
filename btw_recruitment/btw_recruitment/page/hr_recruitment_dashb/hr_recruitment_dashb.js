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
let jobs_table_filters = { designation: null, department: null, recruiter: null, status: null };
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
// $('a[data-tab="jobs"]').click(() => {
//     console.log("Jobs tab clicked"); // should print
//     load_jobs_department_options();
//     load_jobs_table();
// });

frappe.pages['hr-recruitment-dashb'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'HR Recruitment Dashboard',
        single_column: true
    });
$(frappe.render_template("hr_recruitment_dashb")).appendTo(page.body);
page.add_field({
    label: 'From Date',
    fieldtype: 'Date',
    fieldname: 'from_date',
    change() {
        dashboard_filters.from_date = this.value  || null;
        on_global_date_change();
    }
});

page.add_field({
    label: 'To Date',
    fieldtype: 'Date',
    fieldname: 'to_date',
    change() {
        dashboard_filters.to_date = this.value  || null;
        on_global_date_change();
    }
});
page.add_field({
    label: 'Clear Date Filter', // No label, just a button
    fieldtype: 'Button',
    fieldname: 'clear_date_filter',
    options: 'Clear Dates',
    click() {
        // Clear the input fields
        $('input[data-fieldname="from_date"]').val('');
        $('input[data-fieldname="to_date"]').val('');

        // Reset the dashboard filter values
        dashboard_filters.from_date = null;
        dashboard_filters.to_date = null;

        // Refresh the currently active tab
        on_global_date_change();
    }
});

function on_global_date_change() {
    const active_tab = $("#hr-dashboard-tabs .nav-link.active").data("tab");

    if (active_tab === "overall") {
        refresh_dashboard();
    }

    if (active_tab === "candidates") {
        candidate_table_state.offset = 0;
        load_candidate_table();
    }
    if (active_tab === "jobs") {
        jobs_table_state.offset = 0;
        load_jobs_table();
    }
    if (active_tab === "job-applications") {
        job_applications_table_state.offset = 0;
        load_job_applications_table();
    }
    if (active_tab === "company") { company_table_state.offset = 0; load_company_table(); }
}

// When Stage filter changes
$(document).on("change", "#filter-stage", function() {
    dashboard_filters.stage = $(this).val() || null;

    // Reset pagination
    applications_pagination.offset = 0;
    applications_pagination.current_page = 1;

    // Reload table
    load_applications_table();
});

// Clear filters button
$(document).on("click", "#clear-application-filters", function() {
    $("#filter-stage").val("");
    dashboard_filters.stage = null;

    applications_pagination.offset = 0;
    applications_pagination.current_page = 1;

    load_applications_table();
});

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
    }
    if (tab === "jobs") {   
        load_jobs_department_options();
        load_jobs_table();
    }
    if (tab === "job-applications") {
        load_job_applications_table();
    }
    if (tab === "company") {
        load_company_table();
    }
});
$(document).on("click", "#apply-candidate-filters", function () {
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
});

$("#apply-job-filters").click(() => {
    jobs_table_filters.designation = $("#filter-job-title").val() || null; // <-- map to designation
    jobs_table_filters.department = $("#filter-job-department").val() || null;
    jobs_table_filters.recruiter = $("#filter-job-recruiter").val() || null;
    jobs_table_filters.status = $("#filter-job-status").val() || null;

    jobs_table_state.offset = 0;
    load_jobs_table();
});

$("#clear-job-filters").click(() => {
    $("#filter-job-title").val("");
    $("#filter-job-department").val("");
    $("#filter-job-recruiter").val("");
    $("#filter-job-status").val("");

    jobs_table_filters.designation = null; // <-- correct
    jobs_table_filters.department = null;
    jobs_table_filters.recruiter = null;
    jobs_table_filters.status = null;

    jobs_table_state.offset = 0;
    load_jobs_table();
});

// Job Applications tab handlers
$(document).on("click", 'a[data-tab="job-applications"]', () => {
    console.log("Job Applications tab clicked");
    load_job_applications_table();
});

$("#apply-application-filters").click(() => {
    job_applications_table_filters.company_name = $("#filter-application-company").val() || null;
    job_applications_table_filters.job_opening_title = $("#filter-application-opening").val() || null;
    job_applications_table_filters.designation = $("#filter-application-designation").val() || null;

    job_applications_table_state.offset = 0;
    load_job_applications_table();
});

$("#clear-application-filters").click(() => {
    $("#filter-application-company").val("");
    $("#filter-application-opening").val("");
    $("#filter-application-designation").val("");

    job_applications_table_filters.company_name = null;
    job_applications_table_filters.job_opening_title = null;
    job_applications_table_filters.designation = null;

    job_applications_table_state.offset = 0;
    load_job_applications_table();
});

$(document).on("click", 'a[data-tab="company"]', function () {
    console.log("Company tab opened");
    load_company_table();
});
$("#apply-company-filters").click(() => {
    company_filters.company_name = $("#filter-company-name").val() || null;
    company_filters.client_type = $("#filter-company-type").val() || null;
    company_filters.industry = $("#filter-company-industry").val() || null;
    company_filters.state = $("#filter-company-state").val() || null;
    company_filters.city = $("#filter-company-city").val() || null;
    company_filters.client_status = $("#filter-company-status").val() || null;

    company_table_state.offset = 0;
    load_company_table();
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
            render_applications_table();
            render_urgent_openings_table();
            // load_candidate_department_options();
            // render_candidate_table();
            // load_candidate_table()
            // load_jobs_table()
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
            link: "/app/dkp_candidate?blacklisted=1"
        },
        {
            label: "Active Applications",
            value: data.active_applications,
            link: "/app/dkp_job_application"
        },
        {
            label: "Jobs Offered",
            value: data.offers_released,
            link: "/app/dkp_job_application?stage=Offered"
        },
        {
            label: "Total Job Openings",
            value: data.total_job_openings,
            link: "/app/dkp_job_opening"
        }
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

function render_applications_table() {
    const $section = $("#applications-section");
    $section.empty();

    const table_container = $(`
        <div class="card" id="applications-table-wrapper" style="margin-top: 20px; padding: 16px; margin-bottom: 40px;">
            <h4>Active Applications</h4>
            <div id="applications-table-filters"></div>
            <div id="applications-table-container">
                <table class="table table-bordered">
                    <thead>
                        <tr>
                            <th>Candidate</th>
                            <th>Stage</th>
                            <th>Interview Date</th>
                            <th>Application</th>
                        </tr>
                    </thead>
                    <tbody id="applications-table-body">
                        <tr>
                            <td colspan="4" class="text-muted text-center">Loading...</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div id="applications-pagination-container" class="mt-2"></div>
        </div>
    `);

// Create filter row
const filterRow = $(`
    <div class="row mb-2 justify-content-end">
        <div class="col-md-3">
            <select class="form-control" id="filter-stage">
                <option value="">All Stages</option>
                ${stageOptions.map(stage => `<option value="${stage}">${stage}</option>`).join('')}
            </select>
        </div>
        <div class="col-md-3 d-flex align-items-end">
            <button class="btn btn-sm btn-secondary" id="clear-application-filters">
                Clear Filters
            </button>
        </div>
    </div>
`);


    table_container.find("#applications-table-filters").append(filterRow);
    $section.append(table_container);

    load_applications_table();
}


function load_applications_table() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_active_applications",
		args: {
            limit: applications_pagination.limit,
            offset: applications_pagination.offset,
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
            stage: dashboard_filters.stage 
        },
        callback: function(r) {
			 console.log("APPLICATION API RESPONSE:", r);
            console.log("r.message:", r.message);
            console.log("r.message.data:", r.message?.data);
            const tbody = $("#applications-table-body");
            tbody.empty();

            if (!r.message || !r.message.data || r.message.data.length === 0) {
    tbody.html(`
        <tr>
            <td colspan="4" class="text-muted text-center">
                No active applications
            </td>
        </tr>
    `);

    $("#applications-pagination-container").empty();

    return;
}

			applications_pagination.total = r.message.total;
            r.message.data.forEach((row, index) => {
                const serial = applications_pagination.offset + index + 1;
                const stageText = row.stage?.trim() || "No Assigned Stage";
                const stageColor = stageColors[row.stage?.trim()] || "#cccccc";
                
                tbody.append(`
                    <tr>
                        <td>${serial}. 
                            <a href="/app/dkp_candidate/${row.candidate_name}">
                                ${row.candidate_name}
                            </a>
                        </td>
                        <td>
                            <span style="
                                display: inline-block;
                                padding: 4px 8px;
                                border-radius: 12px;
                                background-color: ${stageColor};
                                color: #fff;
                                font-weight: 500;
                            ">
                                ${stageText}
                            </span>
                        </td>
                        <td>${row.interview_date || "-"}</td>
                        <td>
                            <a href="/app/dkp_job_application/${row.job_application}">
                                ${row.job_application}
                            </a>
                        </td>
                    </tr>
                `);
            });
			render_applications_pagination(r.message.data.length);
        }
    });
}

function render_applications_pagination(currentCount) {
    $("#applications-pagination").remove();

    const totalPages = Math.ceil(applications_pagination.total / applications_pagination.limit);
    const container = $(`
        <div id="applications-pagination" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div id="page-info">Page ${applications_pagination.current_page} of ${totalPages}</div>
            <div>
                <button id="prev-page" class="btn btn-sm btn-outline-primary">Previous</button>
                <button id="next-page" class="btn btn-sm btn-outline-primary">Next</button>
            </div>
        </div>
    `);

    $("#applications-pagination-container").append(container);


    if (applications_pagination.current_page === 1) $("#prev-page").attr("disabled", true);
    if (applications_pagination.current_page === totalPages) $("#next-page").attr("disabled", true);

    $("#prev-page").click(() => {
        if (applications_pagination.current_page > 1) {
            applications_pagination.current_page--;
            applications_pagination.offset -= applications_pagination.limit;
            load_applications_table();
        }
    });

    $("#next-page").click(() => {
        if (applications_pagination.current_page < totalPages) {
            applications_pagination.current_page++;
            applications_pagination.offset += applications_pagination.limit;
            load_applications_table();
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
                                <th>Recruiter</th>
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
                        <td>${row.company || "-"}</td>
                        <td>${row.assign_recruiter || "-"}</td>
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



function load_jobs_table() {
    console.log("Loading Jobs Table...", jobs_table_filters, jobs_table_state);

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
            limit: jobs_table_state.limit,
            offset: jobs_table_state.offset,
            designation: jobs_table_filters.designation,
            department: jobs_table_filters.department,
            recruiter: jobs_table_filters.recruiter,
            status: jobs_table_filters.status
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
                    <th>Designation</th>
                    <th>Company</th>
                    <th>Department</th>
                    <th>Recruiter</th>
                    <th>Status</th>
                    <th>No. of Positions</th>
                    <th>Created On</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    if (!data || !data.length) {
        table.find("tbody").append(`
            <tr><td colspan="7" class="text-center text-muted">No job openings found</td></tr>
        `);
    } else {
        data.forEach(d => {
            table.find("tbody").append(`
                <tr>
                    <td><a href="/app/dkp_job_opening/${d.name}">${d.designation || "-"}</a></td>
                    <td>${d.company || "-"}</td>
                    <td>${d.department || "-"}</td>
                    <td>${d.recruiter || "-"}</td>
                    <td>${d.status || "-"}</td>
                    <td>${d.number_of_positions || "-"}</td>
                    <td>${frappe.datetime.str_to_user(d.creation)}</td>
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

function load_job_applications_table() {
    console.log("Loading Job Applications Table...", job_applications_table_filters, job_applications_table_state);

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_job_applications_table",
        args: {
            from_date: dashboard_filters.from_date,
            to_date: dashboard_filters.to_date,
            limit: job_applications_table_state.limit,
            offset: job_applications_table_state.offset,
            company_name: job_applications_table_filters.company_name,
            job_opening_title: job_applications_table_filters.job_opening_title,
            designation: job_applications_table_filters.designation
        },
        callback(r) {
            console.log("Job Applications API Response:", r);

            if (r.message) {
                render_job_applications_table(r.message.data, r.message.total);
            } else {
                render_job_applications_table([], 0);
            }
        }
    });
}

function render_job_applications_table(data, total) {
    console.log("render_job_applications_table called with data:", data);
    const $container = $("#job-applications-table");
    $container.empty();

    if (!data || !data.length) {
        $container.append(`
            <div class="card p-4 text-center text-muted">
                <p>No job applications found</p>
            </div>
        `);
        return;
    }

    // Create cards for each application
    data.forEach((app, index) => {
        const cardId = `app-card-${index}`;
        const candidatesId = `candidates-${index}`;
        const candidates = app.candidates || [];
        const candidatesCount = app.candidates_count || 0;
        
        const card = $(`
            <div class="card mb-3 application-card" style="border-left: 4px solid #4A90E2;">
                <div class="card-header" style="background: #f8f9fa; cursor: pointer;" data-toggle="collapse" data-target="#${candidatesId}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h5 class="mb-1" style="color: #2c3e50;">
                                <a href="/app/dkp_job_application/${app.name}" style="color: #2c3e50; text-decoration: none;">
                                    ${app.name}
                                </a>
                            </h5>
                            <div class="d-flex flex-wrap gap-3 mt-2" style="font-size: 0.9em; color: #6c757d;">
                                <span><strong>Company:</strong> ${app.company_name || "-"}</span>
                                <span><strong>Opening:</strong> ${app.job_opening_title || "-"}</span>
                                <span><strong>Designation:</strong> ${app.designation || "-"}</span>
                                ${app.joining_date ? `<span><strong>Joining:</strong> ${frappe.datetime.str_to_user(app.joining_date)}</span>` : ''}
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="badge badge-primary" style="font-size: 0.9em; padding: 6px 12px;">
                                ${candidatesCount} Candidate${candidatesCount !== 1 ? 's' : ''}
                            </span>
                            <i class="fa fa-chevron-down ml-2 toggle-icon" style="transition: transform 0.3s;"></i>
                        </div>
                    </div>
                </div>
                <div id="${candidatesId}" class="collapse">
                    <div class="card-body" style="background: #ffffff;">
                        ${candidates.length > 0 ? `
                            <div class="candidates-list">
                                ${candidates.map((candidate, cIndex) => {
                                    const stageText = candidate.stage?.trim() || "No Stage";
                                    const stageColor = stageColors[candidate.stage?.trim()] || "#6c757d";
                                    return `
                                        <div class="candidate-item mb-3 p-3" style="border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa;">
                                            <div class="d-flex justify-content-between align-items-start">
                                                <div class="flex-grow-1">
                                                    <h6 class="mb-2">
                                                        <a href="/app/dkp_candidate/${candidate.candidate_name}" style="color: #2c3e50; text-decoration: none; font-weight: 600;">
                                                            ${candidate.candidate_name || "-"}
                                                        </a>
                                                    </h6>
                                                    <div class="d-flex flex-wrap gap-3" style="font-size: 0.85em;">
                                                        ${candidate.interview_date ? `
                                                            <span style="color: #495057;">
                                                                <i class="fa fa-calendar"></i> 
                                                                Interview: ${frappe.datetime.str_to_user(candidate.interview_date)}
                                                            </span>
                                                        ` : ''}
                                                        ${candidate.interview_feedback ? `
                                                            <span style="color: #495057;">
                                                                <i class="fa fa-comment"></i> 
                                                                Feedback: ${candidate.interview_feedback}
                                                            </span>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span class="badge" style="
                                                        background-color: ${stageColor};
                                                        color: #fff;
                                                        padding: 6px 12px;
                                                        border-radius: 12px;
                                                        font-weight: 500;
                                                        font-size: 0.85em;
                                                    ">
                                                        ${stageText}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : `
                            <div class="text-center text-muted py-3">
                                <p class="mb-0">No candidates added to this application yet</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `);
        
        $container.append(card);
    });

    // Add toggle icon rotation on collapse/expand
    $container.find('.card-header').on('click', function() {
        const icon = $(this).find('.toggle-icon');
        const collapse = $(this).next('.collapse');
        
        // Use setTimeout to check state after Bootstrap animation
        setTimeout(() => {
            if (collapse.hasClass('show')) {
                icon.css('transform', 'rotate(180deg)');
            } else {
                icon.css('transform', 'rotate(0deg)');
            }
        }, 100);
    });

    // Pagination
    const total_pages = Math.ceil(total / job_applications_table_state.limit);
    const current_page = Math.floor(job_applications_table_state.offset / job_applications_table_state.limit) + 1;

    const pagination = $(`
        <div class="mt-3 d-flex align-items-center justify-content-between">
            <div>
                <span class="text-muted">Showing ${job_applications_table_state.offset + 1} to ${Math.min(job_applications_table_state.offset + job_applications_table_state.limit, total)} of ${total} applications</span>
            </div>
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-primary" id="job-applications-prev">Prev</button>
                <span>Page ${current_page} of ${total_pages || 1}</span>
                <button class="btn btn-sm btn-primary" id="job-applications-next">Next</button>
            </div>
        </div>
    `);

    $container.append(pagination);

    $("#job-applications-prev")
        .prop("disabled", job_applications_table_state.offset === 0)
        .click(() => {
            job_applications_table_state.offset -= job_applications_table_state.limit;
            load_job_applications_table();
        });

    $("#job-applications-next")
        .prop("disabled", current_page >= total_pages)
        .click(() => {
            job_applications_table_state.offset += job_applications_table_state.limit;
            load_job_applications_table();
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