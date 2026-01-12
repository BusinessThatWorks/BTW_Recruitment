let company_dashboard_filters = {
    from_date: null,
    to_date: null
};
let company_table_state = {
    limit: 10,
    offset: 0,
    total: 0
};
let company_table_filters = {
    client_type: null,
    industry: null,
    client_status: null
};

frappe.pages['hr-recruitment-compa'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'HR Recruitment Company',
		single_column: true
	});

    // Date Filters
    page.add_field({
        label: 'From Date',
        fieldtype: 'Date',
        fieldname: 'from_date',
        change() {
            company_dashboard_filters.from_date = this.value;
            load_company_dashboard();
        }
    });

    page.add_field({
        label: 'To Date',
        fieldtype: 'Date',
        fieldname: 'to_date',
        change() {
            company_dashboard_filters.to_date = this.value;
            load_company_dashboard();
        }
    });

    // Layout
    $(`
        <div class="company-dashboard">
            <div class="row" id="company-kpi-cards"></div>

           <div class="row mt-4">
    <div class="col-md-12">
        <div id="client-type-chart"></div>
    </div>
</div>

<div class="row mt-4">
    <div class="col-md-12">
        <div id="industry-chart"></div>
    </div>
</div>
<div class="row mt-4">
    <div class="col-md-12">
        <h4>Company Overview</h4>

<div class="row mb-3" id="company-table-filters">
    <div class="col-md-3">
        <select class="form-control" id="filter-client-type">
            <option value="">Client Type</option>
            <option value="Recruitment Only">Recruitment Only</option>
            <option value="Consulting Only">Consulting Only</option>
            <option value="Recruitment + Consulting">Recruitment + Consulting</option>
        </select>
    </div>

    <div class="col-md-3">
        <select class="form-control" id="filter-industry">
            <option value="">Industry</option>
        </select>
    </div>

    <div class="col-md-3">
        <select class="form-control" id="filter-client-status">
            <option value="">Client Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
        </select>
    </div>
    <div class="col-md-3 d-flex align-items-end">
                        <button class="btn btn-sm btn-secondary" id="clear-company-filters">
                            Clear Filters
                        </button>
                    </div>
</div>
        <div id="company-table"></div>
    </div>
</div>
        </div>
    `).appendTo(page.body);

	$(document).on("change", "#filter-client-type, #filter-industry, #filter-client-status", function () {
    company_table_filters.client_type = $("#filter-client-type").val() || null;
    company_table_filters.industry = $("#filter-industry").val() || null;
    company_table_filters.client_status = $("#filter-client-status").val() || null;

    // Reset pagination
    company_table_state.offset = 0;

    load_company_table();
	});
    $(document).on("click", "#clear-company-filters", function() {
    // Reset UI selects
    $("#filter-client-type").val("");
    $("#filter-industry").val("");
    $("#filter-client-status").val("");

    // Reset filter state object
    company_table_filters = {
    client_type: null,
    industry: null,
    client_status: null
};

    // Reset pagination
    company_table_state.offset = 0;

    // Reload table
    load_company_table();
});
	load_industry_filter_options();
    load_company_dashboard();
};

function load_company_dashboard() {
    load_company_kpis();
    load_client_type_chart();
    load_industry_chart();
	load_company_table(); 
	// load_industry_filter_options();

}

// ---------------- KPIs ----------------
function load_company_kpis() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: {
            report_name: "Company Recruitment KPIs",
            filters: {
                from_date: company_dashboard_filters.from_date,
                to_date: company_dashboard_filters.to_date
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
        "Total Companies": "/app/dkp_company",
        "Active Clients": "/app/dkp_company?client_status=Active",
        "Inactive Clients": "/app/dkp_company?client_status=Inactive",
        "Companies with Open Jobs": "/app/dkp_job_opening?status=Open",
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
            from_date: company_dashboard_filters.from_date,
            to_date: company_dashboard_filters.to_date
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
                from_date: company_dashboard_filters.from_date,
                to_date: company_dashboard_filters.to_date
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
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_company_table",
        args: {
            from_date: company_dashboard_filters.from_date,
            to_date: company_dashboard_filters.to_date,
            limit: company_table_state.limit,
            offset: company_table_state.offset,
			 client_type: company_table_filters.client_type,
    industry: company_table_filters.industry,
    client_status: company_table_filters.client_status,
        },
        callback(r) {
            if (r.message) {
                render_company_table(r.message.data, r.message.total);
            }
        }
    });
}
function render_company_table(data, total) {
    const $container = $("#company-table");
    $container.empty();

    const table = $(`
        <table class="table table-bordered table-striped">
            <thead>
                <tr>
                    <th>Company</th>
                    <th>Client Type</th>
                    <th>Industry</th>
                    <th>Status</th>
                    <th>Open Jobs</th>
                    <th>Active Applications</th>
                    <th>Poach</th>
                    <th>Replacement Days</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `);

    data.forEach(d => {
        $(`
            <tr>
                <td>
                    <a href="/app/dkp_company/${d.company_name}">
                        ${d.company_name || "-"}
                    </a>
                </td>
                <td>${d.client_type || "-"}</td>
                <td>${d.industry || "-"}</td>
                <td>${d.client_status || "-"}</td>
                <td>${d.open_jobs}</td>
                <td>${d.active_applications}</td>
                <td>${d.no_poach ? "Yes" : "No"}</td>
                <td>${d.replacement_days || "-"}</td>
            </tr>
        `).appendTo(table.find("tbody"));
    });

    $container.append(table);

    // ---------------- Pagination (INSIDE TABLE CONTAINER) ----------------
    const total_pages = Math.ceil(total / company_table_state.limit);

    const current_page = Math.floor(company_table_state.offset / company_table_state.limit) + 1;

    const pagination = $(`
        <div class="mt-2">
            <button class="btn btn-sm btn-primary" id="company-prev">Prev</button>
            Page ${current_page} of ${total_pages}
            <button class="btn btn-sm btn-primary" id="company-next">Next</button>
        </div>
    `);

    $container.append(pagination);

    $("#company-prev")
        .prop("disabled", company_table_state.offset === 0)
        .click(() => {
            company_table_state.offset -= company_table_state.limit;
            load_company_table();
        });

    $("#company-next")
        .prop("disabled", current_page >= total_pages)
        .click(() => {
            company_table_state.offset += company_table_state.limit;
            load_company_table();
        });
}

function load_industry_filter_options() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_distinct_industries",
        callback(r) {
            const $industry = $("#filter-industry");
            $industry.empty();
            $industry.append(`<option value="">All</option>`);

            (r.message || []).forEach(ind => {
                $industry.append(
                    `<option value="${(ind)}">${ind.toUpperCase()}</option>`
                );
            });
        }
    });
}


