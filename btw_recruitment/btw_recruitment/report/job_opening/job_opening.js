// Copyright (c) 2026, Sarim and contributors
// For license information, please see license.txt

frappe.query_reports["Job Opening"] = {
    filters: [
        // ========== DATE FILTERS ==========
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            width: "100"
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            width: "100"
        },
        
        // ========== SORTING FILTERS ==========
        {
            fieldname: "sort_by",
            label: __("Sort By"),
            fieldtype: "Select",
            options: [
                "",
                { value: "name", label: __("Job Opening") },
                { value: "company_name", label: __("Company") },
                { value: "designation", label: __("Designation") },
                { value: "department", label: __("Department") },
                { value: "status", label: __("Status") },
                { value: "priority", label: __("Priority") },
                { value: "number_of_positions", label: __("Positions") },
                { value: "creation", label: __("Created On") },
                { value: "ageing", label: __("Ageing (Days)") }
            ],
            default: "creation",
            width: "120"
        },
        {
            fieldname: "sort_order",
            label: __("Sort Order"),
            fieldtype: "Select",
            options: [
                { value: "Desc", label: __("Descending ↓") },
                { value: "Asc", label: __("Ascending ↑") }
            ],
            default: "Desc",
            width: "120"
        }
    ],

    // onload: function(report) {
    //     // Add info message
    //     setTimeout(() => {
    //         // Check if message already exists
    //         if (!$('.report-sort-info').length) {
    //             const info_html = `
    //                 <div class="report-sort-info" style="
    //                     background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
    //                     border-left: 4px solid #2196f3;
    //                     padding: 12px 16px;
    //                     margin: 10px 0 15px 0;
    //                     border-radius: 6px;
    //                     display: flex;
    //                     align-items: center;
    //                     gap: 10px;
    //                     font-size: 13px;
    //                 ">
    //                     <i class="fa fa-info-circle" style="color: #2196f3; font-size: 18px;"></i>
    //                     <div>
    //                         <strong style="color: #1565c0;">Tip:</strong> 
    //                         <span style="color: #333;">
    //                             Use <b>Sort By</b> and <b>Sort Order</b> filters above to sort data. 
    //                             Excel download will include sorted data.
    //                         </span>
    //                     </div>
    //                 </div>
    //             `;
                
    //             // Insert after filter section
    //             $(report.page.main).find('.frappe-list').before(info_html);
    //         }
    //     }, 500);
    // },

    // formatter: function(value, row, column, data, default_formatter) {
    //     value = default_formatter(value, row, column, data);
        
    //     // Priority column styling
    //     if (column.fieldname === "priority" && data.priority) {
    //         const colors = {
    //             "Low": "#28a745",
    //             "Medium": "#ffc107", 
    //             "High": "#fd7e14",
    //             "Critical": "#dc3545",
    //             "Urgent": "#dc3545"
    //         };
    //         const bg = colors[data.priority] || "#6c757d";
    //         value = `<span style="
    //             background: ${bg};
    //             color: white;
    //             padding: 4px 12px;
    //             border-radius: 12px;
    //             font-weight: 600;
    //             font-size: 11px;
    //         ">${data.priority}</span>`;
    //     }
        
    //     // Ageing column - highlight old jobs
    //     if (column.fieldname === "ageing" && data.ageing > 45) {
    //         value = `<span style="
    //             background: #f8d7da;
    //             color: #721c24;
    //             padding: 4px 8px;
    //             border-radius: 4px;
    //             font-weight: 600;
    //         ">${data.ageing}</span>`;
    //     }
        
    //     return value;
    // }
};