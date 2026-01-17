let job_dashboard_filters = {
    from_date: null,
    to_date: null
};
let job_health_filters = {
    department: null,
    priority: null,
    sla_status: null
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
    <div class="col-md-12">
        <div id="job-status-chart"></div>
    </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div id="job-department-chart"></div>
            </div>
        </div>


            <div class="row mt-4 mb-4">
                <div class="col-md-12">
                    <h4>Job Health Overview</h4>
                <div class="row mb-3" id="job-health-table-filters">
                    <div class="col-md-3">
                        <select class="form-control" id="filter-department">
                            <option value="">Department</option>
                        </select>
                    </div>

                    <div class="col-md-3">
                        <select class="form-control" id="filter-priority">
                            <option value="">Priority</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>

                    <div class="col-md-3">
                        <select class="form-control" id="filter-sla-status">
                            <option value="">Status</option>
                            <option value="Open">Open</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Closed – Hired">Closed – Hired</option>
                            <option value="Closed – Cancelled">Closed – Cancelled</option>
                        </select>
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                        <button class="btn btn-sm btn-secondary" id="clear-job-filters">
                            Clear Filters
                        </button>
                    </div>

                </div>

                    <div id="job-health-table"></div>
                </div>
            </div>

            
        </div>
    `).appendTo(page.body);

    $(document).on("change", "#filter-department, #filter-priority, #filter-sla-status", function () {
    job_health_filters.department = $("#filter-department").val() || null;
    job_health_filters.priority = $("#filter-priority").val() || null;
    job_health_filters.sla_status = $("#filter-sla-status").val() || null;

    // Reset pagination
    job_health_offset = 0;

    // Reload table
    load_job_health();

     $(document).on("click", "#clear-job-filters", function() {
    // Reset UI selects
    $("#filter-department").val("");
    $("#filter-priority").val("");
    $("#filter-sla-status").val("");

    // Reset filter state object
    job_health_filters = {
        department: null,
        priority: null,
        sla_status: null
    };

    // Reset pagination
    job_health_offset = 0;

    // Reload table
    load_job_health();
});
});
   
    load_department_filter_options()
    // Initial load (VERY IMPORTANT)
    load_job_dashboard();
};
function load_job_dashboard() {
    load_job_kpis();
	load_job_health();
    load_department_filter_options()

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
        {
            label: "Total Job Openings",
            value: data.total_jobs,
            link: "/app/dkp_job_opening"
        },
        {
        label: "Total Positions",
        value: data.total_positions,
        link: "/app/dkp_job_opening?status=Open"
    },
        {
            label: "Active Jobs",
            value: data.active_jobs,
            link: "/app/dkp_job_opening?status=Open"
        },
        
        {
            label: "Critical Jobs",
            value: data.priority_jobs,
            link: "/app/dkp_job_opening?priority=Critical"
        },
        
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
                            <div class="kpi-label">${card.label}</div>
                        </div>
                    </a>
                ` : `
                    <div class="card kpi-card kpi-card-disabled">
                        <div class="kpi-value">${card.value}</div>
                        <div class="kpi-label">${card.label}</div>
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
            from_date: job_dashboard_filters.from_date,
            to_date: job_dashboard_filters.to_date
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
let job_health_offset = 0;
const job_health_limit = 10;

function load_job_health() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_job_health",
        args: {
            from_date: job_dashboard_filters.from_date,
            to_date: job_dashboard_filters.to_date,
            limit: job_health_limit,
            offset: job_health_offset,
             department: job_health_filters.department,
        priority: job_health_filters.priority,
        sla_status: job_health_filters.sla_status,
        },
        callback(r) {
            if(r.message) {
                render_job_health_table(r.message.data, r.message.total);
            }
        }
    });
}

function render_job_health_table(data, total) {
    const $container = $("#job-health-table");
    $container.empty();

    const table = $(`
        <table class="table table-bordered table-striped">
            <thead>
                <tr>
                    <th>Job Opening</th>
                    <th>Department</th>
					<th>Designation</th>
                    <th>Positions</th>
                    <th>Candidates</th>
                    <th>Priority</th>
                    <th>Ageing</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    data.forEach(d => {
        $(`
            <tr>
                <td><a href="/app/dkp_job_opening/${d.job_opening}">${d.job_opening || '-'}</a></td>
                <td>${d.department || '-'}</td>
				<td>${d.designation || '-'}</td>
                <td>${d.positions}</td>
                <td>${d.candidates}</td>
				<td>${d.priority}</td>
                <td>${d.ageing_days}</td>
                <td>${d.status}</td>
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
function load_department_filter_options() {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "DKP_Department",
            fields: ["department"],
            filters: [["department", "is", "set"]],
            limit_page_length: 1000
        },
        callback(r) {
            if (r.message) {
                const $dept = $("#filter-department");
                $dept.find("option:not(:first)").remove();

                const seen = new Set(); // 🔑 unique tracker

                r.message.forEach(d => {
                    if (d.department && !seen.has(d.department)) {
                        seen.add(d.department);
                        $dept.append(
                            `<option value="${d.department}">${d.department}</option>`
                        );
                    }
                });
            }
        }
    });
}


