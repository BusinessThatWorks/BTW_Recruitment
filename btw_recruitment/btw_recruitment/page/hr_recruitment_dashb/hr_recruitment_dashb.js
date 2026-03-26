const stageColors = {
	"In Review": "#D9825B",
	Screening: "#7F78C8",
	Interview: "#6FAFD6",
	"Interview in Progress": "#6FAFD6",
	"Shortlisted For Interview": "#9B7EDE",
	Selected: "#4CAF50",
	Offered: "#6FBF8F",
	Rejected: "#D16B6B",
	"Offer Drop": "#8E8E8E",
	Joined: "#2E7D32",
};

const priorityColors = {
	Critical: "#D75A5A",
	High: "#E39A5F",
};
// ============================================
// FILTER CAPTURE HELPER
// ============================================
function getTableLayout() {
    return window.innerWidth < 768 ? "fixed" : "fluid";
}
let companyTable = null;
let jobsTable = null;
let candidatesTable = null;
function get_datatable_filters(dataTable) {
	if (!dataTable) return {};

	const filters = {};

	try {
		// Method 1: Get from column headers (inline filters)
		const $wrapper = $(dataTable.wrapper);

		$wrapper.find(".dt-filter").each(function () {
			const $input = $(this);
			const value = $input.val();

			if (value && value.trim() !== "") {
				// Get column index and name
				const colIndex = $input.closest(".dt-cell").data("col-index");
				const colName = dataTable.datamanager.columns[colIndex]?.name || colIndex;
				filters[colName] = value.trim();
			}
		});

		// Method 2: Alternative - check datamanager
		if (dataTable.datamanager && dataTable.datamanager.filterRows) {
			// Some versions store filters differently
			const dm = dataTable.datamanager;
			dm.columns?.forEach((col, idx) => {
				if (col.filter) {
					filters[col.name] = col.filter;
				}
			});
		}
	} catch (e) {
		console.log("Error getting filters:", e);
	}

	return filters;
}
// ============================================
// EXCEL DOWNLOAD HELPER
// ============================================

function download_excel_from_rows(filename, headers, rows) {
	let html = "<table><thead><tr>";
	headers.forEach((h) => {
		const safeHeader = frappe.utils?.escape_html?.(h) || h;
		html += `<th>${safeHeader}</th>`;
	});
	html += "</tr></thead><tbody>";

	rows.forEach((row) => {
		html += "<tr>";
		row.forEach((cell) => {
			const text = cell == null ? "" : String(cell);
			const safeText = frappe.utils?.escape_html?.(text) || text;
			html += `<td>${safeText}</td>`;
		});
		html += "</tr>";
	});
	html += "</tbody></table>";

	const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename || "export.xls";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function get_ageing_days(creation) {
	if (!creation) return "-";
	const created_on = frappe.datetime.str_to_obj(creation);
	const today_obj = frappe.datetime.str_to_obj(frappe.datetime.now_date());
	const diff_days = Math.floor((today_obj - created_on) / (1000 * 60 * 60 * 24));
	return diff_days >= 0 ? diff_days : 0;
}

// ============================================
// PAGE LOAD
// ============================================

frappe.pages["hr-recruitment-dashb"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "HR Recruitment Dashboard",
		single_column: true,
	});

	$(frappe.render_template("hr_recruitment_dashb")).appendTo(page.body);

	// Initial load for active tab
	$(document).ready(function () {
		const active_tab = $("#hr-dashboard-tabs .nav-link.active").data("tab");
		if (active_tab === "company") {
			init_company_tab();
			load_company_kpis();
			load_client_type_chart();
		}
	});

	// Tab switching
	$(document).on("click", "#hr-dashboard-tabs .nav-link", function () {
		const tab = $(this).data("tab");

		$("#hr-dashboard-tabs .nav-link").removeClass("active");
		$(this).addClass("active");

		$(".tab-pane").removeClass("active");
		$(`#tab-${tab}`).addClass("active");

		if (tab === "candidates") {
			load_candidates_tab();
		}
		if (tab === "jobs") {
			if (!jobs_from_control) {
				init_jobs_tab();
			} else {
				load_jobs_table();
				load_job_kpis();
			}
		}
		if (tab === "company") {
			if (!companyDataTable) {
				init_company_tab();
			} else {
				load_company_table();
			}
			load_company_kpis();
			load_client_type_chart();
		}
	});
};
// ============================================
// CANDIDATES TAB
// ============================================
let candidateDataTable = null;
let candidate_from_control, candidate_to_control;

function load_candidates_tab() {
	$("#candidates-table").empty();

	if (!candidate_from_control) {
		init_candidate_tab();
	} else {
		load_candidate_table();
	}
	load_kpis();
}

function init_candidate_tab() {
	candidate_from_control = frappe.ui.form.make_control({
		parent: $(".candidate-from-date"),
		df: { fieldtype: "Date", label: "From Date", change: () => load_candidate_table() },
		render_input: true,
	});

	candidate_to_control = frappe.ui.form.make_control({
		parent: $(".candidate-to-date"),
		df: { fieldtype: "Date", label: "To Date", change: () => load_candidate_table() },
		render_input: true,
	});

	$("#candidate-clear-dates")
		.off("click")
		.on("click", function () {
			candidate_from_control.set_value(null);
			candidate_to_control.set_value(null);
			load_candidate_table();
		});

	// ✅ UPDATED: Backend filtered download
	$("#download-candidates-excel")
		.off("click")
		.on("click", function () {
			const from_date = candidate_from_control?.get_value() || null;
			const to_date = candidate_to_control?.get_value() || null;
			const inline_filters = get_datatable_filters(candidateDataTable);

			console.log("Candidates Download - Filters:", inline_filters);

			frappe.call({
				method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidate_table",
				args: {
					from_date: from_date,
					to_date: to_date,
					// filters: inline_filters,
                    limit: 0,  // 👈 CHANGE: 0 means get all
                    offset: 0,
                    filters: JSON.stringify(candidatesInlineFilters)  // 👈 CHANGE
				},
				callback(r) {
					console.log("Candidates Response:", r.message?.data?.length, "records");

					if (!r.message?.data?.length) {
						frappe.msgprint(__("No data to download."));
						return;
					}

					const headers = [
						"Candidate",
						"Department",
						"Designation",
						"Experience (Yrs)",
						"Skills",
						"Certifications",
						"Created On",
					];

					const rows = r.message.data.map((d) => [
						d.candidate_name || d.name || "-",
						d.department || "-",
						d.current_designation || "-",
						d.total_experience_years ?? "-",
						d.skills_tags || "-",
						d.key_certifications || "-",
						d.creation ? frappe.datetime.str_to_user(d.creation) : "-",
					]);

					download_excel_from_rows("candidates_filtered.xls", headers, rows);

					frappe.show_alert({
						message: `Downloaded ${rows.length} candidates`,
						indicator: "green",
					});
				},
			});
		});

	load_candidate_table();
}

// ============ CANDIDATES PAGINATION STATE ============
let candidatesPage = 1;
const candidatesLimit = 20;
let candidatesTotal = 0;
let candidatesInlineFilters = {};    // 👈 ADD THIS
let candidatesFilterTimeout = null;   // 👈 ADD THIS

// ============ LOAD TABLE ============
function load_candidate_table() {
    const offset = (candidatesPage - 1) * candidatesLimit;
    
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidate_table",
        args: { 
            from_date: candidate_from_control?.get_value() || null,
            to_date: candidate_to_control?.get_value() || null,
            limit: candidatesLimit,
            offset: offset,
            filters: JSON.stringify(candidatesInlineFilters)  // 👈 ADD THIS
        },
        callback: function(r) {
            candidatesTotal = r.message?.total || 0;
            render_candidate_table(r.message?.data || []);
            update_candidates_pagination();
        }
    });
}

// ============ UPDATE PAGINATION UI ============
function update_candidates_pagination() {
    const totalPages = Math.ceil(candidatesTotal / candidatesLimit) || 1;
    const start = candidatesTotal ? ((candidatesPage - 1) * candidatesLimit) + 1 : 0;
    const end = Math.min(candidatesPage * candidatesLimit, candidatesTotal);
    
    $("#candidates-showing-text").text(`Showing ${start}-${end} of ${candidatesTotal}`);
    $("#candidates-current-page").text(candidatesPage);
    $("#candidates-total-pages").text(totalPages);
    
    $("#candidates-prev-btn").prop("disabled", candidatesPage <= 1);
    $("#candidates-next-btn").prop("disabled", candidatesPage >= totalPages);
}

// ============ PAGINATION EVENTS ============
$(document).on("click", "#candidates-prev-btn", function() { 
    if (candidatesPage > 1) { 
        candidatesPage--; 
        load_candidate_table(); 
    }
});

$(document).on("click", "#candidates-next-btn", function() { 
    const totalPages = Math.ceil(candidatesTotal / candidatesLimit);
    if (candidatesPage < totalPages) { 
        candidatesPage++; 
        load_candidate_table(); 
    }
});

$(document).on("click", "#candidate-clear-dates", function() {
    candidate_from_control?.set_value("");
    candidate_to_control?.set_value("");
    candidatesPage = 1;
    load_candidate_table();
});

// ============ RENDER TABLE ============
function render_candidate_table(data) {
    const $container = $("#candidates-table");
    $container.empty();

    if (!data.length) {
        $container.html('<p class="text-muted text-center">No candidates found</p>');
        candidateDataTable = null;
        return;
    }

    // 👇 Starting index for serial number
    const startIndex = (candidatesPage - 1) * candidatesLimit;

    const columns = [
        { name: "#", width: 1 },  // 👈 Serial Number
        {
            name: "Candidate",
            format: (value, row, col, rowIndex) => {
                const name = data[rowIndex]?.name || "";
                return `<a href="/app/dkp_candidate/${value}" target="_blank" style="color:#2490ef;font-weight:600;">${value || "-"}</a>`;
            },
        },
        { name: "Department" },
        { name: "Designation" },
        { name: "Experience (Yrs)" },
        {
            name: "Skills",
            format: (value) => {
                return `<div style="max-width:250px;white-space:normal;word-break:break-word;">${value || "-"}</div>`;
            },
        },
        {
            name: "Certifications",
            format: (value) => {
                return `<div style="max-width:200px;white-space:normal;word-break:break-word;">${value || "-"}</div>`;
            },
        },
        { name: "Created On" },
    ];

    const tableData = data.map((d, index) => [
        startIndex + index + 1,  // 👈 Correct serial number
        d.candidate_name || d.name || "-",
        d.department || "-",
        d.current_designation || "-",
        d.total_experience_years ?? "-",
        d.skills_tags || "-",
        d.key_certifications || "-",
        d.creation ? frappe.datetime.str_to_user(d.creation) : "-",
    ]);
    function renderCandidatesTable(){
        if(candidateDataTable){
            candidateDataTable.destroy();
        }
        candidateDataTable = new frappe.DataTable($container[0], {
        columns,
        data: tableData,
        inlineFilters: true,
        noDataMessage: "No candidates found",
        layout: getTableLayout(),
        serialNoColumn: false  // 👈 Default serial number hatao
    });
    }
    renderCandidatesTable();

    let resizeTimeout;
    window.addEventListener("resize", () => {  
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderCandidatesTable();
        }, 300); 
    });
   
    setTimeout(() => {
        restore_candidates_filters();
        attach_candidates_filter_listeners();
    }, 100);
}
// ============ INLINE FILTER HANDLING ============
const candidatesColumns = ["#", "Candidate", "Department", "Designation", 
                           "Experience (Yrs)", "Skills", "Certifications", "Created On"];

function restore_candidates_filters() {
    if (Object.keys(candidatesInlineFilters).length === 0) return;
    
    $("#candidates-table .dt-filter").each(function(index) {
        const colName = candidatesColumns[index];
        if (candidatesInlineFilters[colName]) {
            $(this).val(candidatesInlineFilters[colName]);
        }
    });
}

function attach_candidates_filter_listeners() {
    $("#candidates-table .dt-filter").off("input.backend").on("input.backend", function() {
        
        clearTimeout(candidatesFilterTimeout);
        
        candidatesFilterTimeout = setTimeout(() => {
            const filters = {};
            
            $("#candidates-table .dt-filter").each(function(index) {
                const value = $(this).val()?.trim();
                const colName = candidatesColumns[index];
                if (value && colName !== "#") {
                    filters[colName] = value;
                }
            });
            
            console.log("Candidates inline filters:", filters);
            
            candidatesPage = 1;
            candidatesInlineFilters = filters;
            load_candidate_table();
            
        }, 500);
    });
}
function load_kpis() {
	const from_date = candidate_from_control?.get_value() || null;
	const to_date = candidate_to_control?.get_value() || null;

	frappe.call({
		method: "frappe.desk.query_report.run",
		args: { report_name: "HR Recruitment KPIs", filters: { from_date, to_date } },
		callback: function (r) {
			if (r.message?.result) render_kpi_cards(r.message.result[0]);
		},
	});
}

function render_kpi_cards(data) {
	const cards = [
		{ label: "Total Candidates", value: data.total_candidates, link: "/app/dkp_candidate" },
		{
			label: "Blacklisted Candidates",
			value: data.blacklisted_candidates,
			link: "/app/dkp_candidate?blacklisted=Yes",
		},
	];

	const $container = $("#hr-kpi-cards");
	$container.empty();

	cards.forEach((card) => {
		$(`<a href="${card.link}" class="kpi-card">
               <div class="kpi-value">${card.value}</div>
               <div class="kpi-label">${card.label}</div>
           </a>`).appendTo($container);
	});
}

// ============================================
// JOBS TAB
// ============================================

let jobsDataTable = null;
let jobs_from_control, jobs_to_control;
let jobsInlineFilters = {};
let jobsFilterTimeout = null;

function init_jobs_tab() {
	jobs_from_control = frappe.ui.form.make_control({
		parent: $(".jobs-from-date"),
		df: {
			fieldtype: "Date",
			label: "From Date",
			change: () => {
				load_jobs_table();
				load_job_kpis();
			},
		},
		render_input: true,
	});

	jobs_to_control = frappe.ui.form.make_control({
		parent: $(".jobs-to-date"),
		df: {
			fieldtype: "Date",
			label: "To Date",
			change: () => {
				load_jobs_table();
				load_job_kpis();
			},
		},
		render_input: true,
	});

	$("#jobs-clear-dates")
		.off("click")
		.on("click", function () {
			jobs_from_control.set_value(null);
			jobs_to_control.set_value(null);
			load_jobs_table();
			load_job_kpis();
		});

	// ✅ UPDATED: Backend filtered download
	$("#download-jobs-excel")
		.off("click")
		.on("click", function () {
			const from_date = jobs_from_control?.get_value() || null;
			const to_date = jobs_to_control?.get_value() || null;
			const inline_filters = get_datatable_filters(jobsDataTable);

			console.log("Jobs Download - Filters:", inline_filters);

			frappe.call({
				method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
				args: {
					from_date: from_date,
					to_date: to_date,
                    limit: 0,  // 👈 CHANGE: 0 means get all
                    offset: 0,
					filters: JSON.stringify(jobsInlineFilters) // 👈 Send inline filters
				},
				callback(r) {
					console.log("Jobs Response:", r.message?.data?.length, "records");

					if (!r.message?.data?.length) {
						frappe.msgprint(__("No data to download."));
						return;
					}

					const headers = [
						"Job Opening",
						"Company",
						"Designation",
						"Department",
						"Recruiters",
						"Status",
						"Priority",
						"Positions",
						"Created On",
						"Ageing",
					];

					const rows = r.message.data.map((d) => [
						d.name || "-",
						d.company_name || "-",
						d.designation || "-",
						d.department || "-",
						d.recruiters || "-",
						d.status || "-",
						d.priority || "-",
						d.number_of_positions || "-",
						d.creation ? moment(d.creation).format("DD-MM-YYYY hh:mm A") : "-",
						get_ageing_days(d.creation),
					]);

					download_excel_from_rows("jobs_filtered.xls", headers, rows);

					frappe.show_alert({
						message: `Downloaded ${rows.length} jobs`,
						indicator: "green",
					});
				},
			});
		});

	load_jobs_table();
	load_job_kpis();
}
// ============ PAGINATION STATE ============
let jobsPage = 1;
const jobsLimit = 20;
let jobsTotal = 0;

// ============ LOAD TABLE ============
function load_jobs_table() {
    const offset = (jobsPage - 1) * jobsLimit;
    
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
        args: { 
            from_date: jobs_from_control?.get_value() || null,
            to_date: jobs_to_control?.get_value() || null,
            limit: jobsLimit,
            offset: offset,
             filters: JSON.stringify(jobsInlineFilters) 
        },
        callback: function(r) {
            jobsTotal = r.message?.total || 0;
            render_jobs_table(r.message?.data || []);
            update_jobs_pagination();
        }
    });
}

// ============ UPDATE PAGINATION UI ============
function update_jobs_pagination() {
    const totalPages = Math.ceil(jobsTotal / jobsLimit) || 1;
    const start = jobsTotal ? ((jobsPage - 1) * jobsLimit) + 1 : 0;
    const end = Math.min(jobsPage * jobsLimit, jobsTotal);
    
    $("#jobs-showing-text").text(`Showing ${start}-${end} of ${jobsTotal}`);
    $("#jobs-current-page").text(jobsPage);
    $("#jobs-total-pages").text(totalPages);
    
    $("#jobs-prev-btn").prop("disabled", jobsPage <= 1);
    $("#jobs-next-btn").prop("disabled", jobsPage >= totalPages);
}

// ============ PAGINATION EVENTS (EVENT DELEGATION) ============

$(document).on("click", "#jobs-prev-btn", function() { 
    console.log("Prev clicked, current page:", jobsPage);
    if (jobsPage > 1) { 
        jobsPage--; 
        load_jobs_table(); 
    }
});

$(document).on("click", "#jobs-next-btn", function() { 
    const totalPages = Math.ceil(jobsTotal / jobsLimit);
    console.log("Next clicked, current page:", jobsPage, "total:", totalPages);
    if (jobsPage < totalPages) { 
        jobsPage++; 
        load_jobs_table(); 
    }
});

$(document).on("click", "#jobs-clear-dates", function() {
    jobs_from_control?.set_value("");
    jobs_to_control?.set_value("");
    jobsPage = 1;
    load_jobs_table();
});

function render_jobs_table(data) {
    const $container = $("#jobs-table");
    $container.empty();

    // 👇 Starting number calculate karo based on current page
    const startIndex = (jobsPage - 1) * jobsLimit;

    const columns = [
        { name: "#", width: 1 },  // 👈 Serial Number Column
        {
            name: "Job Opening",
            format: (value, row, col, rowIndex) => {
                const name = data[rowIndex]?.name || "";
                return `<a href="/app/dkp_job_opening/${value}" target="_blank" style="color:#2490ef;font-weight:600;">${value || "-"}</a>`;
            },
        },
        { name: "Company" },
        { name: "Designation" },
        { name: "Department" },
        { name: "Recruiters" },
        { name: "Status" },
        {
            name: "Priority",
            format: (value) => {
                const bg = priorityColors[value] || "#6c757d";
                return `<span style="padding:4px 10px;border-radius:12px;color:#fff;font-weight:600;background:${bg};">${value || "-"}</span>`;
            },
        },
        { name: "Positions" },
        { name: "Created On" },
        {
            name: "Ageing",
            format: (value) => {
                const days = parseInt(value) || 0;
                const style = days > 45 ? "background:#f8d7da;font-weight:600;padding:4px 8px;border-radius:4px;" : "";
                return `<span style="${style}">${value}</span>`;
            },
        },
    ];

    // 👇 Row number add karo data mein
    const tableData = data.map((d, index) => [
        startIndex + index + 1,  // 👈 Correct serial number
        d.name || "-",
        d.company_name || "-",
        d.designation || "-",
        d.department || "-",
        d.recruiters || "-",
        d.status || "-",
        d.priority || "-",
        d.number_of_positions || "-",
        d.creation ? moment(d.creation).format("DD-MM-YYYY hh:mm A") : "-",
        get_ageing_days(d.creation),
    ]);
    function renderJobsTable(){
        if (jobsDataTable) {
            jobsDataTable.destroy();
    }
    jobsDataTable = new frappe.DataTable($container[0], {
        columns,
        data: tableData,
        inlineFilters: true,
        noDataMessage: "No jobs found",
        layout: getTableLayout(),
        serialNoColumn: false
    });
}
    renderJobsTable();
    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderJobsTable();
        }, 300);
    });
    // 👇 ADD THIS AT END
    setTimeout(() => {
        restore_jobs_filters();
        attach_jobs_filter_listeners();
    }, 100);
}
// ============ INLINE FILTER HANDLING ============
const jobsColumns = ["#", "Job Opening", "Company", "Designation", "Department", 
                     "Recruiters", "Status", "Priority", "Positions", "Created On", "Ageing"];

function restore_jobs_filters() {
    if (Object.keys(jobsInlineFilters).length === 0) return;
    
    $("#jobs-table .dt-filter").each(function(index) {
        const colName = jobsColumns[index];
        if (jobsInlineFilters[colName]) {
            $(this).val(jobsInlineFilters[colName]);
        }
    });
}

function attach_jobs_filter_listeners() {
    $("#jobs-table .dt-filter").off("input.backend").on("input.backend", function() {
        
        clearTimeout(jobsFilterTimeout);
        
        jobsFilterTimeout = setTimeout(() => {
            const filters = {};
            
            $("#jobs-table .dt-filter").each(function(index) {
                const value = $(this).val()?.trim();
                const colName = jobsColumns[index];
                if (value && colName !== "#") {
                    filters[colName] = value;
                }
            });
            
            console.log("Jobs inline filters:", filters);
            
            jobsPage = 1;
            jobsInlineFilters = filters;
            load_jobs_table();
            
        }, 500);
    });
}

function load_job_kpis() {
	const from_date = jobs_from_control?.get_value() || null;
	const to_date = jobs_to_control?.get_value() || null;

	frappe.call({
		method: "frappe.desk.query_report.run",
		args: { report_name: "HR Recruitment – Jobs KPIs", filters: { from_date, to_date } },
		callback(r) {
			if (r.message) {
				const result = r.message.result[0];
				render_job_kpi_cards(result);
				render_job_status_cards(result.status_cards);
				render_job_charts(r.message.chart);
			}
		},
	});
}

function render_job_kpi_cards(data) {
	const cards = [
		{ label: "Total Job Openings", value: data.total_jobs, link: "/app/dkp_job_opening" },
		{ label: "Total Positions", value: data.total_positions, link: "/app/dkp_job_opening" },
	];

	const $container = $("#job-kpi-cards");
	$container.empty();

	cards.forEach((card) => {
		$(`<a href="${card.link}" class="kpi-card">
               <div class="kpi-value">${card.value}</div>
               <div class="kpi-label">${card.label}</div>
           </a>`).appendTo($container);
	});
}

function render_job_status_cards(statusCards) {
	const $row = $("#job-status-kpi-cards");
	$row.empty();

	statusCards.forEach((item) => {

		const link = `/app/dkp_job_opening?status=${encodeURIComponent(item.status)}`;

		$(`<a href="${link}" class="status-card">
               <div class="status-card-header">${item.status}</div>
               <div class="status-card-body">
                   <div class="status-metric">
                       <span class="metric-label">Openings</span>
                       <span class="metric-value">${item.openings}</span>
                   </div>
                   <div class="status-metric">
                       <span class="metric-label">Positions</span>
                       <span class="metric-value">${item.positions}</span>
                   </div>
               </div>
           </a>`).appendTo($row);
	});
}

function render_job_charts(chart) {
	const labels = chart.data.labels;
	const values = chart.data.datasets[0].values;

	new frappe.Chart("#job-status-chart", {
		title: "Job Status Distribution",
		data: { labels, datasets: [{ values }] },
		type: "donut",
		height: 250,
        
	});
}


// ============================================
// COMPANY TAB - COMPLETE WITH PAGINATION + INLINE FILTERS
// ============================================

let companyDataTable = null;
let company_from_control, company_to_control;

// ============ PAGINATION & FILTER STATE ============
let companyPage = 1;
const companyLimit = 20;
let companyTotal = 0;
let companyInlineFilters = {};  // 👈 Store inline filters
let companyFilterTimeout = null;

// ============ INIT FUNCTION ============
function init_company_tab() {
    // Date controls
    company_from_control = frappe.ui.form.make_control({
        parent: $(".company-from-date"),
        df: {
            fieldtype: "Date",
            label: "From Date",
            change: () => {
                companyPage = 1;  // Reset page
                load_company_table();
                load_company_kpis();
            },
        },
        render_input: true,
    });

    company_to_control = frappe.ui.form.make_control({
        parent: $(".company-to-date"),
        df: {
            fieldtype: "Date",
            label: "To Date",
            change: () => {
                companyPage = 1;  // Reset page
                load_company_table();
                load_company_kpis();
            },
        },
        render_input: true,
    });

    // Download button
    $("#download-company-excel").off("click").on("click", function() {
        download_company_excel();
    });

    // Load initial data
    load_company_table();
}

// ============ LOAD TABLE ============
function load_company_table() {
    const offset = (companyPage - 1) * companyLimit;
    
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_companies",
        args: { 
            from_date: company_from_control?.get_value() || null,
            to_date: company_to_control?.get_value() || null,
            limit: companyLimit,
            offset: offset,
            filters: JSON.stringify(companyInlineFilters)  // 👈 Send inline filters
        },
        callback: function(r) {
            companyTotal = r.message?.total || 0;
            render_company_table(r.message?.data || []);
            update_company_pagination();
        }
    });
}

// ============ RENDER TABLE ============
function render_company_table(data) {
    const $container = $("#company-table");
    $container.empty();

    const startIndex = (companyPage - 1) * companyLimit;

    const columns = [
        { name: "#", width: 50 },
        {
            name: "Company",
            format: (value, row, col, rowIndex) => {
                const name = data[rowIndex]?.name || "";
                return `<a href="/app/customer/${name}" target="_blank" style="color:#2490ef;font-weight:600;">${value || "-"}</a>`;
            },
        },
        { name: "Client Type" },
        { name: "Industry" },
        { name: "Location" },
        { name: "Billing Email" },
        { name: "Billing Phone" },
        { name: "Status" },
        { name: "Fee Value" },
        { name: "Replacement" },
    ];

    const tableData = data.map((d, index) => [
        startIndex + index + 1,
        d.company_name || d.name || "-",
        d.client_type || "-",
        d.industry || "-",
        `${d.city || "-"}, ${d.state || "-"}`,
        d.billing_mail || "-",
        d.billing_number || "-",
        d.client_status || "-",
        `${d.standard_fee_value || "0"}%`,
        d.replacement_policy_days || "-",
    ]);

    function renderCompanyTable() {
        if (companyDataTable) {
            companyDataTable.destroy();
        }

        companyDataTable = new frappe.DataTable($container[0], {
            columns,
            data: tableData,
            inlineFilters: true,
            layout: getTableLayout(),
            serialNoColumn: false,
        });
    }

    // initial render
    renderCompanyTable();

    // on resize (debounced)
    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderCompanyTable();
        }, 300);
    });

    // 👇 Attach filter listeners after render
    setTimeout(() => {
        restore_company_filters();
        attach_company_filter_listeners();
    }, 100);
}

// ============ INLINE FILTER HANDLING ============
const companyColumns = ["#", "Company", "Client Type", "Industry", "Location", 
                        "Billing Email", "Billing Phone", "Status", "Fee Value", "Replacement"];

function restore_company_filters() {
    if (Object.keys(companyInlineFilters).length === 0) return;
    
    $("#company-table .dt-filter").each(function(index) {
        const colName = companyColumns[index];
        if (companyInlineFilters[colName]) {
            $(this).val(companyInlineFilters[colName]);
        }
    });
}

function attach_company_filter_listeners() {
    $("#company-table .dt-filter").off("input.backend").on("input.backend", function() {
        
        clearTimeout(companyFilterTimeout);
        
        companyFilterTimeout = setTimeout(() => {
            const filters = {};
            
            $("#company-table .dt-filter").each(function(index) {
                const value = $(this).val()?.trim();
                const colName = companyColumns[index];
                if (value && colName !== "#") {
                    filters[colName] = value;
                }
            });
            
            console.log("Company inline filters:", filters);
            
            companyPage = 1;
            companyInlineFilters = filters;
            load_company_table();
            
        }, 500);  // 500ms debounce
    });
}

// ============ PAGINATION UI ============
function update_company_pagination() {
    const totalPages = Math.ceil(companyTotal / companyLimit) || 1;
    const start = companyTotal ? ((companyPage - 1) * companyLimit) + 1 : 0;
    const end = Math.min(companyPage * companyLimit, companyTotal);
    
    $("#company-showing-text").text(`Showing ${start}-${end} of ${companyTotal}`);
    $("#company-current-page").text(companyPage);
    $("#company-total-pages").text(totalPages);
    
    $("#company-prev-btn").prop("disabled", companyPage <= 1);
    $("#company-next-btn").prop("disabled", companyPage >= totalPages);
}

// ============ PAGINATION EVENTS ============
$(document).on("click", "#company-prev-btn", function() { 
    if (companyPage > 1) { 
        companyPage--; 
        load_company_table(); 
    }
});

$(document).on("click", "#company-next-btn", function() { 
    const totalPages = Math.ceil(companyTotal / companyLimit);
    if (companyPage < totalPages) { 
        companyPage++; 
        load_company_table(); 
    }
});

$(document).on("click", "#company-clear-dates", function() {
    company_from_control?.set_value("");
    company_to_control?.set_value("");
    companyPage = 1;
    companyInlineFilters = {};  // 👈 Clear inline filters too
    load_company_table();
    load_company_kpis();
});

// ============ DOWNLOAD EXCEL ============
function download_company_excel() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_companies",
        args: {
            from_date: company_from_control?.get_value() || null,
            to_date: company_to_control?.get_value() || null,
            limit: 0,  // 👈 0 = no limit, get all
            offset: 0,
            filters: JSON.stringify(companyInlineFilters)
        },
        callback(r) {
            if (!r.message?.data?.length) {
                frappe.msgprint(__("No data to download."));
                return;
            }

            const headers = ["#", "Company", "Client Type", "Industry", "Location", 
                            "Billing Email", "Billing Phone", "Status", "Fee Value", "Replacement"];

            const rows = r.message.data.map((d, index) => [
                index + 1,
                d.company_name || d.name || "-",
                d.client_type || "-",
                d.industry || "-",
                `${d.city || "-"}, ${d.state || "-"}`,
                d.billing_mail || "-",
                d.billing_number || "-",
                d.client_status || "-",
                `${d.standard_fee_value || "0"}%`,
                d.replacement_policy_days || "-",
            ]);

            download_excel_from_rows("companies_filtered.xls", headers, rows);

            frappe.show_alert({
                message: `Downloaded ${rows.length} companies`,
                indicator: "green",
            });
        },
    });
}

function load_company_kpis() {
	const from_date = company_from_control?.get_value() || null;
	const to_date = company_to_control?.get_value() || null;

	frappe.call({
		method: "frappe.desk.query_report.run",
		args: {
			report_name: "Company Recruitment KPIs",
			filters: { from_date, to_date }, // 👈 Date filters bhejo
		},
		callback(r) {
			if (r.message) render_company_kpi_cards(r.message.result);
		},
	});
}

function render_company_kpi_cards(data) {
	const kpiLinks = {
		"Total Clients": "/app/customer",
		"Active Clients": "/app/customer?custom_client_status=Active",
		"Inactive Clients": "/app/customer?custom_client_status=Inactive",
		"Clients with Open Jobs": "/app/dkp_job_opening?status=Open",
	};

	const $container = $("#company-kpi-cards");
	$container.empty();

	data.forEach((item) => {
		const link = kpiLinks[item.kpi];
		if (link) {
			$(`<a href="${link}" class="kpi-card">
                   <div class="kpi-value">${item.value}</div>
                   <div class="kpi-label">${item.kpi}</div>
               </a>`).appendTo($container);
		} else {
			$(`<div class="kpi-card">
                   <div class="kpi-value">${item.value}</div>
                   <div class="kpi-label">${item.kpi}</div>
               </div>`).appendTo($container);
		}
	});
}

function load_client_type_chart() {
	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_client_type_distribution",
		callback(r) {
			if (r.message) {
				new frappe.Chart("#client-type-chart", {
					title: "Client Type Distribution",
					data: r.message.data,
					type: "pie",
					height: 280,
				});
			}
		},
	});
}
