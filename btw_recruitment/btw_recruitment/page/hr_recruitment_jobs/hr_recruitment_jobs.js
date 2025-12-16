let job_dashboard_filters = {
    from_date: null,
    to_date: null
};

frappe.pages['hr-recruitment-jobs'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'HR Recruitment Jobs Dashboard',
        single_column: true
    });

    // Date Filters
    page.add_field({
        label: 'From Date',
        fieldtype: 'Date',
        fieldname: 'from_date',
        change() {
            job_dashboard_filters.from_date = this.value;
            load_job_dashboard();
        }
    });

    page.add_field({
        label: 'To Date',
        fieldtype: 'Date',
        fieldname: 'to_date',
        change() {
            job_dashboard_filters.to_date = this.value;
            load_job_dashboard();
        }
    });

    // Layout
    $(`
        <div class="hr-jobs-dashboard">
            <div class="row" id="job-kpi-cards"></div>

            <div class="row mt-4">
                <div class="col-md-6">
                    <div id="job-status-chart"></div>
                </div>
                <div class="col-md-6">
                    <div id="job-department-chart"></div>
                </div>
            </div>

            <div class="row mt-4">
                <div class="col-md-12">
                    <h4>Job Health Overview</h4>
                    <div id="job-health-table"></div>
                </div>
            </div>

            <div class="row mt-4">
                <div class="col-md-12">
                    <h4>Urgent Job Openings</h4>
                    <div id="urgent-jobs-table"></div>
                </div>
            </div>
        </div>
    `).appendTo(page.body);

    // Initial load (VERY IMPORTANT)
    load_job_dashboard();
};
function load_job_dashboard() {
    load_job_kpis();
	load_job_health();
	load_urgent_jobs();
}

function load_job_kpis() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: {
            report_name: "HR Recruitment – Jobs KPIs",
            filters: {
                from_date: job_dashboard_filters.from_date,
                to_date: job_dashboard_filters.to_date
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
    const cards = [
        { label: "Total Job Openings", value: data.total_jobs },
        { label: "Active Jobs", value: data.active_jobs },
        { label: "Total Open Positions", value: data.total_positions },
        { label: "High / Critical Jobs", value: data.priority_jobs },
        { label: "SLA Breached Jobs", value: data.sla_breached_jobs }
    ];

    const $row = $("#job-kpi-cards");
    $row.empty();

    cards.forEach(card => {
        $(`
            <div class="kpi-col">
                <div class="card kpi-card">
                    <div class="kpi-value">${card.value}</div>
                    <div class="kpi-label">${card.label}</div>
                </div>
            </div>
        `).appendTo($row);
    });

    // Add styles if not already added
    if (!$("#job-kpi-card-style").length) {
        $("<style>")
            .prop("type", "text/css")
            .attr("id", "job-kpi-card-style")
            .html(`
				#job-kpi-cards {
            display: flex;
            gap: 12px;
            padding:16px;
        }
        .kpi-col {
            flex: 1;

        }
                .kpi-card {
                    padding: 14px;
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
const JOB_STATUS_COLORS = {
    open: "#5bc0de",             // blue
    hold: "#f0ad4e",             // amber
    closed_hired: "#5cb85c",     // green (success)
    closed_cancelled: "#d9534f", // red (stopped)
};

function render_job_charts(chart) {
    // Status Distribution Chart
    // const status_chart = new frappe.Chart("#job-status-chart", {
    //     title: "Job Status Distribution",
    //     data: chart.data,
    //     type: chart.type || "bar",
    //     height: 250,
    //     colors: ['#5bc0de', '#f0ad4e', '#5cb85c', '#d9534f']
    // });
	const labels = chart.data.labels;
    const values = chart.data.datasets[0].values;

    const datasets = labels.map((label, index) => {
        const key = normalize_status(label);

        return {
            name: label,
            values: labels.map((_, i) => i === index ? values[index] : 0),
            chartType: "bar",
            // color: JOB_STATUS_COLORS[key] || "#cccccc"
        };
    });

    new frappe.Chart("#job-status-chart", {
        title: "Job Status Distribution",
        data: {
            labels,
            datasets
        },
        type: "pie",
        height: 250
    });

    // Department-wise chart (if separate data needed)
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_department_job_data",
        args: {
            from_date: job_dashboard_filters.from_date,
            to_date: job_dashboard_filters.to_date
        },
        callback(r) {
            if(r.message) {
                const dept_data = r.message;
                new frappe.Chart("#job-department-chart", {
                    title: "Department-wise Job Openings",
                    data: {
                        labels: dept_data.map(d => d.department),
                        datasets: [
                            {
                                name: "Jobs",
                                values: dept_data.map(d => d.count)
                            }
                        ]
                    },
                    type: "bar",
                    height: 250,
                    colors: ['#857be7']
                });
            }
        }
    });
}
let job_health_offset = 0;
const job_health_limit = 10;

function load_job_health() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_job_health",
        args: {
            from_date: job_dashboard_filters.from_date,
            to_date: job_dashboard_filters.to_date,
            limit: job_health_limit,
            offset: job_health_offset
        },
        callback(r) {
            if(r.message) {
                render_job_health_table(r.message.data, r.message.total);
            }
        }
    });
}
function render_status_badge(status) {
    const key = normalize_status(status);
    const color = JOB_STATUS_COLORS[key] || "#d3c0c0ff";

    return `
        <span style="
            background:${color};
            color:#fff;
            padding:4px 10px;
            border-radius:999px;
            font-size:12px;
            font-weight:500;
            white-space:nowrap;
            display:inline-block;
        ">
            ${status || "-"}
        </span>
    `;
}

function render_priority_badge(priority) {
    const p = (priority || "").toLowerCase();

    const color_map = {
        low: "#6c757d",       // grey
        medium: "#5bc0de",    // blue
        high: "#f0ad4e",      // amber
        critical: "#d9534f"   // red
    };

    const color = color_map[p] || "#cccccc";

    return `
        <span style="
            background:${color};
            color:#fff;
            padding:4px 10px;
            border-radius:999px;
            font-size:12px;
            font-weight:500;
            white-space:nowrap;
            display:inline-block;
        ">
            ${priority || "-"}
        </span>
    `;
}
function render_sla_badge(status) {
    const s = (status || "").toLowerCase();

    let color = "#6c757d"; // default grey

    if (s === "on track") color = "#5cb85c";       // green
    else if (s === "at risk") color = "#f0ad4e";   // amber
    else if (s === "breached") color = "#d9534f";  // red
    else if (s === "closed") color = "#5bc0de";    // blue

    return `
        <span style="
            background:${color};
            color:#fff;
            padding:4px 10px;
            border-radius:999px;
            font-size:12px;
            font-weight:500;
            white-space:nowrap;
            display:inline-block;
        ">
            ${status || "-"}
        </span>
    `;
}

function render_job_health_table(data, total) {
    const $container = $("#job-health-table");
    $container.empty();

    const table = $(`
        <table class="table table-bordered table-striped">
            <thead>
                <tr>
                    <th>Job Opening</th>
					<th>Job Applications</th>
                    <th>Department</th>
					<th>Designation</th>
                    <th>Positions</th>
                    <th>Candidates</th>
                    <th>Priority</th>
					<th>SLA Due Date</th>
                    <th>SLA Status</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    data.forEach(d => {
        $(`
            <tr>
                <td><a href="/app/dkp_job_opening/${d.job_opening}">${d.job_opening || '-'}</a></td>
				<td><a href="/app/dkp_job_application/${d.job_applications.join(", ")}">${d.job_applications.join(", ") || '-'}</a></td>
                <td>${d.department || '-'}</td>
				<td>${d.designation || '-'}</td>
                <td>${d.positions}</td>
                <td>${d.candidates}</td>
				<td>${render_priority_badge(d.priority)}</td>
                <td>${d.sla_due_date || '-'}</td>
                <td>${render_sla_badge(d.sla_status)}</td>

            </tr>
        `).appendTo(table.find("tbody"));
    });

    $container.append(table);

    // Pagination
    const total_pages = Math.ceil(total / job_health_limit);
    const current_page = Math.floor(job_health_offset / job_health_limit) + 1;

    const pagination = $(`
        <div class="mt-2">
            <button class="btn btn-sm btn-primary" id="prev-page">Prev</button>
            Page ${current_page} of ${total_pages}
            <button class="btn btn-sm btn-primary" id="next-page">Next</button>
        </div>
    `);

    $container.append(pagination);

    $("#prev-page").prop("disabled", job_health_offset === 0).click(() => {
        job_health_offset -= job_health_limit;
        load_job_health();
    });

    $("#next-page").prop("disabled", current_page >= total_pages).click(() => {
        job_health_offset += job_health_limit;
        load_job_health();
    });
}
let urgent_jobs_offset = 0;
const urgent_jobs_limit = 10; // 2 rows per page

function load_urgent_jobs() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_urgent_openings_jobs",
        args: {
            from_date: job_dashboard_filters.from_date,
            to_date: job_dashboard_filters.to_date,
            limit: urgent_jobs_limit,
            offset: urgent_jobs_offset
        },
        callback(r) {
            if (r.message) {
                render_urgent_jobs_table(r.message.data, r.message.total);
            }
        }
    });
}

function render_urgent_jobs_table(data, total) {
    const $container = $("#urgent-jobs-table");
    $container.empty();

    const table = $(`
        <table class="table table-bordered table-striped">
            <thead>
                <tr>
                    <th>Job Opening</th>
					<th>Designation</th>
                    <th>Company</th>
                    <th>Assign Recruiter</th>
                    <th>Priority</th>
                    <th>Positions</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    data.forEach(d => {
        $(`
            <tr>
                <td><a href="/app/dkp_job_opening/${d.name}">${d.name || '-'}</a></td>
                <td>${d.designation || '-'}</td>

                <td>${d.company || '-'}</td>
                <td>${d.assign_recruiter || '-'}</td>
                <td>${d.priority || '-'}</td>
                <td>${d.number_of_positions || 0}</td>
                <td>${d.status || '-'}</td>
            </tr>
        `).appendTo(table.find("tbody"));
    });

    $container.append(table);

    // Pagination
    const total_pages = Math.ceil(total / urgent_jobs_limit);
    const current_page = Math.floor(urgent_jobs_offset / urgent_jobs_limit) + 1;

    const pagination = $(`
        <div class="mt-2">
            <button class="btn btn-sm btn-primary" id="urgent-prev-page">Prev</button>
            Page ${current_page} of ${total_pages}
            <button class="btn btn-sm btn-primary" id="urgent-next-page">Next</button>
        </div>
    `);

    $container.append(pagination);

    $("#urgent-prev-page").prop("disabled", urgent_jobs_offset === 0).click(() => {
        urgent_jobs_offset -= urgent_jobs_limit;
        load_urgent_jobs();
    });

    $("#urgent-next-page").prop("disabled", current_page >= total_pages).click(() => {
        urgent_jobs_offset += urgent_jobs_limit;
        load_urgent_jobs();
    });
}
