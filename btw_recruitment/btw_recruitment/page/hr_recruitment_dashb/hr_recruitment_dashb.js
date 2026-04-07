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
				const colName =
					dataTable.datamanager.columns[colIndex]?.name || colIndex;
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

	const blob = new Blob([html], {
		type: "application/vnd.ms-excel;charset=utf-8;",
	});
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
	const diff_days = Math.floor(
		(today_obj - created_on) / (1000 * 60 * 60 * 24),
	);
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
		df: {
			fieldtype: "Date",
			label: "From Date",
			change: () => load_candidate_table(),
		},
		render_input: true,
	});

	candidate_to_control = frappe.ui.form.make_control({
		parent: $(".candidate-to-date"),
		df: {
			fieldtype: "Date",
			label: "To Date",
			change: () => load_candidate_table(),
		},
		render_input: true,
	});

	$("#candidate-clear-dates")
		.off("click")
		.on("click", function () {
			candidate_from_control.set_value(null);
			candidate_to_control.set_value(null);
			load_candidate_table();
		});

	$("#download-candidates-excel")
		.off("click")
		.on("click", function () {
			download_candidates_excel();
		});

	// 👇 FIX: ONLY ONE setTimeout - no duplicate
	setTimeout(() => {
		candidate_from_control.set_value(frappe.datetime.get_today());
		candidate_to_control.set_value(frappe.datetime.get_today());
		load_candidate_table();
	}, 100);
}

// ============ LOAD TABLE (NO PAGINATION) ============
function load_candidate_table() {
	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidate_table",
		args: {
			from_date: candidate_from_control?.get_value() || null,
			to_date: candidate_to_control?.get_value() || null,
			limit: 0,
			offset: 0,
		},
		callback: function (r) {
			render_candidate_table(r.message?.data || []);
		},
	});
}

// ============ RENDER TABLE ============
function render_candidate_table(data) {
	const $container = $("#candidates-table");
	$container.empty();

	const columns = [
		{ name: "#", width: 50 },
		{
			name: "Candidate",
			format: (value, row, col, rowIndex) => {
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
		index + 1,
		d.candidate_name || d.name || "-",
		d.department || "-",
		d.current_designation || "-",
		d.total_experience_years ?? "-",
		d.skills_tags || "-",
		d.key_certifications || "-",
		d.creation ? frappe.datetime.str_to_user(d.creation) : "-",
	]);

	if (candidateDataTable) {
		candidateDataTable.destroy();
	}

	candidateDataTable = new frappe.DataTable($container[0], {
		columns,
		data: tableData,
		inlineFilters: true,
		noDataMessage: "No candidates found",
		layout: getTableLayout(),
		serialNoColumn: false,
	});
}

// ============ EXCEL DOWNLOAD WITH FILTERS + SORTING ============
function download_candidates_excel() {
	if (!candidateDataTable) {
		frappe.msgprint(__("No data available to download."));
		return;
	}

	let rowsToExport = [];

	try {
		const dm = candidateDataTable.datamanager;
		const allRows = dm.getRows();
		const totalRows = allRows.length;

		const rowViewOrder = dm.rowViewOrder || [];
		const filteredIndices = dm.getFilteredRowIndices() || [];

		let finalIndices = [];

		// Check if sorting is applied
		const isSorted =
			rowViewOrder.length > 0 &&
			!rowViewOrder.every((val, idx) => val === idx);

		// Check if filter is applied
		const isFiltered =
			filteredIndices.length > 0 && filteredIndices.length < totalRows;

		console.log("isSorted:", isSorted, "isFiltered:", isFiltered);

		if (isSorted && isFiltered) {
			const filterSet = new Set(filteredIndices);
			finalIndices = rowViewOrder.filter((idx) => filterSet.has(idx));
			console.log("Using: Sorted + Filtered:", finalIndices.length);
		} else if (isSorted) {
			finalIndices = rowViewOrder;
			console.log("Using: Only Sorted:", finalIndices.length);
		} else if (isFiltered) {
			finalIndices = filteredIndices;
			console.log("Using: Only Filtered:", finalIndices.length);
		} else {
			finalIndices = allRows.map((_, i) => i);
			console.log("Using: All rows:", finalIndices.length);
		}

		rowsToExport = finalIndices.map((i) => allRows[i]);
	} catch (e) {
		console.log("Error getting rows:", e);
		frappe.msgprint(__("Error getting data."));
		return;
	}

	if (!rowsToExport || rowsToExport.length === 0) {
		frappe.msgprint(__("No data to download."));
		return;
	}

	const headers = [
		"#",
		"Candidate",
		"Department",
		"Designation",
		"Experience (Yrs)",
		"Skills",
		"Certifications",
		"Created On",
	];

	const excelRows = rowsToExport.map((row) => {
		return [
			getCellValue(row[0]),
			getCellValue(row[1]),
			getCellValue(row[2]),
			getCellValue(row[3]),
			getCellValue(row[4]),
			getCellValue(row[5]),
			getCellValue(row[6]),
			getCellValue(row[7]),
		];
	});

	download_excel_from_rows("candidates_export.xls", headers, excelRows);

	frappe.show_alert({
		message: `Downloaded ${excelRows.length} candidates`,
		indicator: "green",
	});
}
function load_kpis() {
	const from_date = candidate_from_control?.get_value() || null;
	const to_date = candidate_to_control?.get_value() || null;

	frappe.call({
		method: "frappe.desk.query_report.run",
		args: {
			report_name: "HR Recruitment KPIs",
			filters: { from_date, to_date },
		},
		callback: function (r) {
			if (r.message?.result) render_kpi_cards(r.message.result[0]);
		},
	});
}

function render_kpi_cards(data) {
	const cards = [
		{
			label: "Total Candidates",
			value: data.total_candidates,
			link: "/app/dkp_candidate",
		},
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
let jobsDataTable = null;
let jobs_from_control, jobs_to_control;

// function init_jobs_tab() {
// 	jobs_from_control = frappe.ui.form.make_control({
// 		parent: $(".jobs-from-date"),
// 		df: {
// 			fieldtype: "Date",
// 			label: "From Date",
// 			change: () => {
// 				load_jobs_table();
// 				load_job_kpis();
// 			},
// 		},
// 		render_input: true,
// 	});

// 	jobs_to_control = frappe.ui.form.make_control({
// 		parent: $(".jobs-to-date"),
// 		df: {
// 			fieldtype: "Date",
// 			label: "To Date",
// 			change: () => {
// 				load_jobs_table();
// 				load_job_kpis();
// 			},
// 		},
// 		render_input: true,
// 	});

// 	// 👇 DEFAULT TODAY'S DATE SET
// 	jobs_from_control.set_value(frappe.datetime.get_today());
// 	jobs_to_control.set_value(frappe.datetime.get_today());

// 	$("#jobs-clear-dates")
// 		.off("click")
// 		.on("click", function () {
// 			jobs_from_control.set_value(null);
// 			jobs_to_control.set_value(null);
// 			load_jobs_table();
// 			load_job_kpis();
// 		});

// 	// 👇 EXCEL DOWNLOAD WITH FILTERS + SORTING
// 	$("#download-jobs-excel")
// 		.off("click")
// 		.on("click", function () {
// 			download_jobs_excel();
// 		});

// 	load_jobs_table();
// 	load_job_kpis();
// }
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

	$("#download-jobs-excel")
		.off("click")
		.on("click", function () {
			download_jobs_excel();
		});

	// 👇 FIX: setTimeout with date set THEN load
	setTimeout(() => {
		jobs_from_control.set_value(frappe.datetime.get_today());
		jobs_to_control.set_value(frappe.datetime.get_today());
		load_jobs_table();
		load_job_kpis();
	}, 100);
}

// ============ LOAD TABLE ============
function load_jobs_table() {
	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
		args: {
			from_date: jobs_from_control?.get_value() || null,
			to_date: jobs_to_control?.get_value() || null,
			limit: 0,
			offset: 0,
		},
		callback: function (r) {
			render_jobs_table(r.message?.data || []);
		},
	});
}

// ============ RENDER TABLE ============
function render_jobs_table(data) {
	const $container = $("#jobs-table");
	$container.empty();

	const columns = [
		{ name: "#", width: 50 },
		{
			name: "Job Opening",
			format: (value, row, col, rowIndex) => {
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
				const style =
					days > 45
						? "background:#f8d7da;font-weight:600;padding:4px 8px;border-radius:4px;"
						: "";
				return `<span style="${style}">${value}</span>`;
			},
		},
	];

	const tableData = data.map((d, index) => [
		index + 1,
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

	if (jobsDataTable) {
		jobsDataTable.destroy();
	}

	jobsDataTable = new frappe.DataTable($container[0], {
		columns,
		data: tableData,
		inlineFilters: true,
		noDataMessage: "No jobs found",
		layout: getTableLayout(),
		serialNoColumn: false,
	});
}
function download_jobs_excel() {
	if (!jobsDataTable) {
		frappe.msgprint(__("No data available to download."));
		return;
	}

	let rowsToExport = [];

	try {
		const dm = jobsDataTable.datamanager;
		const allRows = dm.getRows();
		const totalRows = allRows.length;

		const rowViewOrder = dm.rowViewOrder || [];
		const filteredIndices = dm.getFilteredRowIndices() || [];

		let finalIndices = [];

		// Check if sorting is applied (rowViewOrder is not sequential)
		const isSorted =
			rowViewOrder.length > 0 &&
			!rowViewOrder.every((val, idx) => val === idx);

		// Check if filter is applied (filteredIndices is less than total)
		const isFiltered =
			filteredIndices.length > 0 && filteredIndices.length < totalRows;

		console.log("isSorted:", isSorted, "isFiltered:", isFiltered);

		if (isSorted && isFiltered) {
			// Both sorting and filter applied
			// Take rowViewOrder but only keep indices that exist in filteredIndices
			const filterSet = new Set(filteredIndices);
			finalIndices = rowViewOrder.filter((idx) => filterSet.has(idx));
			console.log(
				"Using: Sorted + Filtered intersection:",
				finalIndices.length,
			);
		} else if (isSorted) {
			// Only sorting applied
			finalIndices = rowViewOrder;
			console.log(
				"Using: Only Sorted (rowViewOrder):",
				finalIndices.length,
			);
		} else if (isFiltered) {
			// Only filter applied
			finalIndices = filteredIndices;
			console.log("Using: Only Filtered:", finalIndices.length);
		} else {
			// Nothing applied - all rows in order
			finalIndices = allRows.map((_, i) => i);
			console.log("Using: All rows (default):", finalIndices.length);
		}

		// Get rows in final order
		rowsToExport = finalIndices.map((i) => allRows[i]);
	} catch (e) {
		console.log("Error getting rows:", e);
		frappe.msgprint(__("Error getting data."));
		return;
	}

	if (!rowsToExport || rowsToExport.length === 0) {
		frappe.msgprint(__("No data to download."));
		return;
	}

	const headers = [
		"#",
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

	const excelRows = rowsToExport.map((row) => {
		return [
			getCellValue(row[0]),
			getCellValue(row[1]),
			getCellValue(row[2]),
			getCellValue(row[3]),
			getCellValue(row[4]),
			getCellValue(row[5]),
			getCellValue(row[6]),
			getCellValue(row[7]),
			getCellValue(row[8]),
			getCellValue(row[9]),
			getCellValue(row[10]),
		];
	});

	download_excel_from_rows("jobs_export.xls", headers, excelRows);

	frappe.show_alert({
		message: `Downloaded ${excelRows.length} jobs`,
		indicator: "green",
	});
}

// 👇 Helper: Extract actual value from cell
function getCellValue(cell) {
	if (cell == null) return "-";

	if (typeof cell === "string" || typeof cell === "number") {
		return stripHTML(String(cell)) || "-";
	}

	if (typeof cell === "object") {
		const value =
			cell.content || cell.value || cell.text || cell.data || "";
		return stripHTML(String(value)) || "-";
	}

	return "-";
}

// 👇 Helper: Strip HTML Tags
function stripHTML(value) {
	if (value == null || value === "") return "";
	const str = String(value);
	const tmp = document.createElement("div");
	tmp.innerHTML = str;
	return tmp.textContent || tmp.innerText || str;
}
function load_job_kpis() {
	const from_date = jobs_from_control?.get_value() || null;
	const to_date = jobs_to_control?.get_value() || null;

	frappe.call({
		method: "frappe.desk.query_report.run",
		args: {
			report_name: "HR Recruitment – Jobs KPIs",
			filters: { from_date, to_date },
		},
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
		{
			label: "Total Job Openings",
			value: data.total_jobs,
			link: "/app/dkp_job_opening",
		},
		{
			label: "Total Positions",
			value: data.total_positions,
			link: "/app/dkp_job_opening",
		},
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
// COMPANY TAB
// ============================================
let companyDataTable = null;
let company_from_control, company_to_control;

// ============ INIT FUNCTION ============
function init_company_tab() {
	company_from_control = frappe.ui.form.make_control({
		parent: $(".company-from-date"),
		df: {
			fieldtype: "Date",
			label: "From Date",
			change: () => {
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
				load_company_table();
				load_company_kpis();
			},
		},
		render_input: true,
	});

	// 👇 DEFAULT TODAY'S DATE
	company_from_control.set_value(frappe.datetime.get_today());
	company_to_control.set_value(frappe.datetime.get_today());

	// Clear dates button
	$("#company-clear-dates")
		.off("click")
		.on("click", function () {
			company_from_control.set_value(null);
			company_to_control.set_value(null);
			load_company_table();
			load_company_kpis();
		});

	// Download button
	$("#download-company-excel")
		.off("click")
		.on("click", function () {
			download_company_excel();
		});

	// Load initial data
	load_company_table();
}

// ============ LOAD TABLE (NO PAGINATION) ============
function load_company_table() {
	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_companies",
		args: {
			from_date: company_from_control?.get_value() || null,
			to_date: company_to_control?.get_value() || null,
			limit: 0,
			offset: 0,
		},
		callback: function (r) {
			render_company_table(r.message?.data || []);
		},
	});
}

// ============ RENDER TABLE ============
function render_company_table(data) {
	const $container = $("#company-table");
	$container.empty();

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

	if (companyDataTable) {
		companyDataTable.destroy();
	}

	companyDataTable = new frappe.DataTable($container[0], {
		columns,
		data: tableData,
		inlineFilters: true,
		noDataMessage: "No companies found",
		layout: getTableLayout(),
		serialNoColumn: false,
	});
}

// ============ EXCEL DOWNLOAD WITH FILTERS + SORTING ============
function download_company_excel() {
	if (!companyDataTable) {
		frappe.msgprint(__("No data available to download."));
		return;
	}

	let rowsToExport = [];

	try {
		const dm = companyDataTable.datamanager;
		const allRows = dm.getRows();
		const totalRows = allRows.length;

		const rowViewOrder = dm.rowViewOrder || [];
		const filteredIndices = dm.getFilteredRowIndices() || [];

		let finalIndices = [];

		// Check if sorting is applied
		const isSorted =
			rowViewOrder.length > 0 &&
			!rowViewOrder.every((val, idx) => val === idx);

		// Check if filter is applied
		const isFiltered =
			filteredIndices.length > 0 && filteredIndices.length < totalRows;

		console.log("isSorted:", isSorted, "isFiltered:", isFiltered);

		if (isSorted && isFiltered) {
			const filterSet = new Set(filteredIndices);
			finalIndices = rowViewOrder.filter((idx) => filterSet.has(idx));
			console.log("Using: Sorted + Filtered:", finalIndices.length);
		} else if (isSorted) {
			finalIndices = rowViewOrder;
			console.log("Using: Only Sorted:", finalIndices.length);
		} else if (isFiltered) {
			finalIndices = filteredIndices;
			console.log("Using: Only Filtered:", finalIndices.length);
		} else {
			finalIndices = allRows.map((_, i) => i);
			console.log("Using: All rows:", finalIndices.length);
		}

		rowsToExport = finalIndices.map((i) => allRows[i]);
	} catch (e) {
		console.log("Error getting rows:", e);
		frappe.msgprint(__("Error getting data."));
		return;
	}

	if (!rowsToExport || rowsToExport.length === 0) {
		frappe.msgprint(__("No data to download."));
		return;
	}

	const headers = [
		"#",
		"Company",
		"Client Type",
		"Industry",
		"Location",
		"Billing Email",
		"Billing Phone",
		"Status",
		"Fee Value",
		"Replacement",
	];

	const excelRows = rowsToExport.map((row) => {
		return [
			getCellValue(row[0]),
			getCellValue(row[1]),
			getCellValue(row[2]),
			getCellValue(row[3]),
			getCellValue(row[4]),
			getCellValue(row[5]),
			getCellValue(row[6]),
			getCellValue(row[7]),
			getCellValue(row[8]),
			getCellValue(row[9]),
		];
	});

	download_excel_from_rows("companies_export.xls", headers, excelRows);

	frappe.show_alert({
		message: `Downloaded ${excelRows.length} companies`,
		indicator: "green",
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
