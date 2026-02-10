// frappe.provide("btw_recruitment");

// frappe.pages["recruiter-dashboard"].on_page_load = function (wrapper) {
//     const page = frappe.ui.make_app_page({
//         parent: wrapper,
//         title: __("Recruiter Dashboard"),
//         single_column: true,
//     });

//     // Load static HTML template into the page body
//     $(frappe.render_template("recruiter_dashboard", {})).appendTo(page.body);

//     new btw_recruitment.RecruiterDashboard(page);
// };

// btw_recruitment.RecruiterDashboard = class {
//     constructor(page) {
//         this.page = page;
//         this.page_length = 10;
//         this.current_page = 1;
//         this.total = 0;
//         this.current_recruiter = null;

//         this.$table = $(page.body).find(".recruiter-table");
//         this.$tbody = this.$table.find("tbody");
//         this.$page_info = $(page.body).find(".recruiter-page-info");
//         this.$btn_prev = $(page.body).find(".recruiter-prev");
//         this.$btn_next = $(page.body).find(".recruiter-next");

//         this.make_recruiter_field();
//         this.bind_pagination();
//     }

//     make_recruiter_field() {
//         const me = this;

//         // Link field at the top to select a recruiter (User)
//         this.recruiter_field = this.page.add_field({
//             label: __("Recruiter"),
//             fieldname: "recruiter",
//             fieldtype: "Link",
//             options: "User",
//             reqd: 1,
//             change() {
//                 const value = me.recruiter_field.get_value();
//                 me.current_recruiter = value;
//                 me.current_page = 1;
//                 me.refresh_data();
//             },
//         });

//         // Only show users with the required recruiter role profiles
//         this.recruiter_field.df.get_query = function () {
//             return {
//                 filters: {
//                     role_profile_name: [
//                         "in",
//                         ["DKP Recruiter", "DKP Recruiter - Exclusive"],
//                     ],
//                     enabled: 1,
//                 },
//             };
//         };

//         // Optionally pre-select the first recruiter from backend
//         frappe.call({
//             method:
//                 "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiters",
//             callback(r) {
//                 const list = r.message || [];
//                 if (list.length && !me.recruiter_field.get_value()) {
//                     me.recruiter_field.set_value(list[0].name);
//                 }
//             },
//         });
//     }

//     bind_pagination() {
//         const me = this;

//         this.$btn_prev.on("click", function () {
//             if (me.current_page > 1) {
//                 me.current_page -= 1;
//                 me.refresh_data();
//             }
//         });

//         this.$btn_next.on("click", function () {
//             const max_page = Math.ceil(me.total / me.page_length) || 1;
//             if (me.current_page < max_page) {
//                 me.current_page += 1;
//                 me.refresh_data();
//             }
//         });
//     }

//     refresh_data() {
//         if (!this.current_recruiter) {
//             this.render_rows([]);
//             this.update_pagination(0);
//             return;
//         }

//         const me = this;
//         const offset = (this.current_page - 1) * this.page_length;

//         frappe.call({
//             method:
//                 "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_openings",
//             args: {
//                 recruiter: this.current_recruiter,
//                 limit: this.page_length,
//                 offset: offset,
//             },
//             freeze: true,
//             freeze_message: __("Loading recruiter data..."),
//             callback(r) {
//                 const resp = r.message || {};
//                 const rows = resp.data || [];
//                 me.total = resp.total || 0;
//                 me.render_rows(rows);
//                 me.update_pagination(me.total);
//             },
//         });
//     }

//     render_rows(rows) {
//         this.$tbody.empty();

//         if (!rows.length) {
//             this.$tbody.append(
//                 `<tr><td colspan="7" class="text-muted text-center">${__(
//                     "No data to show"
//                 )}</td></tr>`
//             );
//             return;
//         }

//         rows.forEach((row) => {
//             const url = `/app/dkp_job_opening/${row.job_opening}`;
//             const opening_html = `<a href="${url}" target="_blank">${frappe.utils.escape_html(
//                 row.job_opening
//             )}</a>`;

//             const tr = `
//                 <tr>
//                     <td>${opening_html}</td>
//                     <td>${frappe.utils.escape_html(row.company_name || "")}</td>
//                     <td>${frappe.utils.escape_html(row.designation || "")}</td>
//                     <td>${frappe.utils.escape_html(row.status || "")}</td>
//                     <td class="text-right">${row.number_of_positions || 0}</td>
//                     <td class="text-right">${row.total_candidates || 0}</td>
//                     <td class="text-right">${row.joined_candidates || 0}</td>
//                 </tr>
//             `;

//             this.$tbody.append(tr);
//         });
//     }

//     update_pagination(total) {
//         const max_page = Math.max(1, Math.ceil((total || 0) / this.page_length));
//         if (this.current_page > max_page) {
//             this.current_page = max_page;
//         }

//         if (!total) {
//             this.$page_info.text(__("Showing 0 of 0 openings"));
//         } else {
//             const start = (this.current_page - 1) * this.page_length + 1;
//             const end = Math.min(this.current_page * this.page_length, total);

//             this.$page_info.text(
//                 __("Showing {0}–{1} of {2} openings", [start, end, total])
//             );
//         }

//         this.$btn_prev.prop("disabled", this.current_page <= 1);
//         this.$btn_next.prop("disabled", this.current_page >= max_page);
//     }
// };

frappe.pages["recruiter-dashboard"].on_page_load = function (wrapper) {

    // ✅ Create page
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Recruiter Dashboard"),
        single_column: true,
    });

    // ✅ Load HTML template
    $(frappe.render_template("recruiter_dashboard", {})).appendTo(page.body);

    // =============================
    // STATE VARIABLES
    // =============================
    let page_length = 10;
    let current_page = 1;
    let total = 0;
    let current_recruiter = null;

    // =============================
    // DOM REFERENCES
    // =============================
    const $table = $(page.body).find(".recruiter-table");
    const $tbody = $table.find("tbody");
    const $page_info = $(page.body).find(".recruiter-page-info");
    const $btn_prev = $(page.body).find(".recruiter-prev");
    const $btn_next = $(page.body).find(".recruiter-next");
    const $kpi_openings = $(page.body).find(".kpi-openings");
    const $kpi_positions = $(page.body).find(".kpi-positions");
    const $kpi_candidates = $(page.body).find(".kpi-candidates");
    const $kpi_joined = $(page.body).find(".kpi-joined");



    // =============================
    // RECRUITER FILTER FIELD
    // =============================
    const recruiter_field = page.add_field({
        label: __("Recruiter"),
        fieldname: "recruiter",
        fieldtype: "Link",
        options: "User",
        reqd: 1,
        change() {
            current_recruiter = recruiter_field.get_value();
            current_page = 1;
            load_data();
            load_kpis();
        },
    });

    // filter only recruiter role profiles
    recruiter_field.df.get_query = function () {
        return {
            filters: {
                role_profile_name: ["in", ["DKP Recruiter", "DKP Recruiter - Exclusive"]],
                enabled: 1,
            },
        };
    };

    function load_kpis() {
        if (!current_recruiter) return;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_kpis",
            args: {
                recruiter: current_recruiter
            },
            callback(r) {
                const k = r.message || {};

                $kpi_openings.text(k.total_openings || 0);
                $kpi_positions.text(k.total_positions || 0);
                $kpi_candidates.text(k.total_candidates || 0);
                $kpi_joined.text(k.total_joined || 0);
            }
        });
    }


    // =============================
    // AUTO SELECT FIRST RECRUITER
    // =============================
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiters",
        callback(r) {
            const list = r.message || [];
            if (list.length) {
                recruiter_field.set_value(list[0].name);
                load_kpis();
            }
            
        },
    });


    // =============================
    // PAGINATION BUTTONS
    // =============================
    $btn_prev.on("click", function () {
        if (current_page > 1) {
            current_page--;
            load_data();
        }
    });

    $btn_next.on("click", function () {
        const max_page = Math.ceil(total / page_length) || 1;
        if (current_page < max_page) {
            current_page++;
            load_data();
        }
    });


    // =============================
    // MAIN DATA LOADER
    // =============================
    function load_data() {
        if (!current_recruiter) {
            render_rows([]);
            update_pagination(0);
            return;
        }

        const offset = (current_page - 1) * page_length;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_openings",
            args: {
                recruiter: current_recruiter,
                limit: page_length,
                offset: offset,
            },
            freeze: true,
            freeze_message: __("Loading recruiter data..."),
            callback(r) {
                const resp = r.message || {};
                const rows = resp.data || [];
                total = resp.total || 0;

                render_rows(rows);
                update_pagination(total);
                update_kpis(rows, total);
            },
        });
    }


    // =============================
    // TABLE RENDER
    // =============================
    function render_rows(rows) {
        $tbody.empty();

        if (!rows.length) {
            $tbody.append(`<tr><td colspan="7" class="text-center text-muted">No data</td></tr>`);
            return;
        }

        rows.forEach(row => {
            const url = `/app/dkp_job_opening/${row.job_opening}`;

            $tbody.append(`
                <tr>
                    <td><a href="${url}" target="_blank">${frappe.utils.escape_html(row.job_opening)}</a></td>
                    <td>${row.company_name || ""}</td>
                    <td>${row.designation || ""}</td>
                    <td>${row.status || ""}</td>
                    <td class="text-right">${row.number_of_positions || 0}</td>
                    <td class="text-right">${row.total_candidates || 0}</td>
                    <td class="text-right">${row.joined_candidates || 0}</td>
                </tr>
            `);
        });
    }


    // =============================
    // PAGINATION TEXT
    // =============================
    function update_pagination(total_count) {
        const max_page = Math.max(1, Math.ceil(total_count / page_length));

        if (!total_count) {
            $page_info.text("Showing 0 of 0 openings");
        } else {
            const start = (current_page - 1) * page_length + 1;
            const end = Math.min(current_page * page_length, total_count);
            $page_info.text(`Showing ${start}–${end} of ${total_count}`);
        }

        $btn_prev.prop("disabled", current_page <= 1);
        $btn_next.prop("disabled", current_page >= max_page);
    }

};