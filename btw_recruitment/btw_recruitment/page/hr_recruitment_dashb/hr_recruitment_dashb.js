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
    "Offered": "#6FBF8F",       // muted emerald mint
    "Rejected": "#D16B6B",      // soft brick red
    "Offer Drop": "#8E8E8E"     // warm graphite grey
};

const priorityColors = {
    "Critical": "#D75A5A",     // matte coral red
    "High": "#E39A5F"          // warm amber pastel
};
frappe.pages['hr-recruitment-dashb'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'HR Recruitment Dashboard',
        single_column: true
    });
// Add Date Range filter
// From Date
// page.add_field({
//     label: 'From Date',
//     fieldtype: 'Date',
//     fieldname: 'from_date',
//     change() {
//         dashboard_filters.from_date = this.value;
//         refresh_dashboard();
//     }
// });

// // To Date
// page.add_field({
//     label: 'To Date',
//     fieldtype: 'Date',
//     fieldname: 'to_date',
//     change() {
//         dashboard_filters.to_date = this.value;
//         refresh_dashboard();
//     }
// });
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

    const $tabs = $(`
    <div class="mt-3">
        <ul class="nav nav-tabs" id="hr-dashboard-tabs">
            <li class="nav-item">
                <a class="nav-link active" data-tab="overall">Overall</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" data-tab="candidates">Candidates</a>
            </li>
        </ul>

        <div class="tab-content pt-3">
            <div class="tab-pane active" id="tab-overall"></div>
            <div class="tab-pane" id="tab-candidates"></div>
        </div>
    </div>
`);
$tabs.appendTo(page.body);
$(`
    <div class="hr-kpi-section">
        <div class="row" id="hr-kpi-cards"></div>

        <div id="pipeline-section"></div>
        <div id="department-section"></div>
        <div id="urgent-openings-section"></div>

        <div id="applications-section"></div>
    </div>
`).appendTo($("#tab-overall"));
$(`
    <div id="candidates-filters" class="mb-2"></div>
    <div id="candidates-table"></div>
`).appendTo($("#tab-candidates"));
$(`
    <div class="row g-2 align-items-end">
        <div class="col-md-3">
            <label>Search Candidate / Skills</label>
            <input type="text" class="form-control" id="candidate-search"
                placeholder="Name, skills, certifications">
        </div>

        <div class="col-md-2">
            <label>Department</label>
            <select class="form-control" id="filter-department">
                <option value="">All</option>
            </select>
        </div>

        <div class="col-md-2">
            <label>Designation</label>
            <input type="text" class="form-control" id="filter-designation"
                placeholder="e.g. React Developer">
        </div>

        <div class="col-md-1">
            <label>Min Exp</label>
            <input type="number" class="form-control" id="filter-min-exp">
        </div>

        <div class="col-md-1">
            <label>Max Exp</label>
            <input type="number" class="form-control" id="filter-max-exp">
        </div>

        <div class="col-md-2">
            <button class="btn btn-primary w-100" id="apply-candidate-filters">
                Apply
            </button>
        </div>

        <div class="col-md-1">
            <button class="btn btn-secondary w-100" id="clear-candidate-filters">
                Clear
            </button>
        </div>
    </div>
`).appendTo($("#candidates-filters"));

    // KPI container
//        $(`
//     <div class="hr-kpi-section mt-3">
//         <div class="row" id="hr-kpi-cards"></div>

//         <div id="pipeline-section"></div>
//         <div id="department-section"></div>
//         <div id="urgent-openings-section"></div>

//         <div id="applications-section"></div>
//     </div>
// `).appendTo(page.body);

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
});
$(document).on("click", "#apply-candidate-filters", function () {
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
    $("#candidate-search").val("");
    $("#filter-department").val("");
    $("#filter-designation").val("");
    $("#filter-min-exp").val("");
    $("#filter-max-exp").val("");

    candidate_table_filters.search_text = null;
    candidate_table_filters.department = null;
    candidate_table_filters.current_designation = null;
    candidate_table_filters.min_experience = null;
    candidate_table_filters.max_experience = null;

    candidate_table_state.offset = 0;
    load_candidate_table();
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
            load_candidate_table()
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
    // cards.forEach(card => {
    // const $col = $(`
    //     <div class="kpi-col">
    //         <div class="card kpi-card">
    //             <div class="kpi-value">${card.value}</div>
    //             <div class="kpi-label">${card.label}</div>
    //         </div>
    //     </div>
    // `);

    // if (card.onClick) {
    //     $col.find(".kpi-card").on("click", card.onClick);
    // }

//     $col.appendTo($row);
// });

}

$("<style>")
    .prop("type", "text/css")
    .html(`
        .kpi-card {
            padding: 10px;
            text-align: center;
            border-radius: 8px;
            background: #ffffff;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            height: 100%;
        }
        #hr-kpi-cards {
            display: flex;
            gap: 12px;
            padding: 0 16px;
        }
        .kpi-col {
            flex: 1;

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
            .kpi-link {
    text-decoration: none;
    color: inherit;
    display: block;
    height: 100%;
}

.kpi-card {
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0,0,0,0.12);
}

    `)
    .appendTo("head");
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
            search_text: candidate_table_filters.search_text
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


