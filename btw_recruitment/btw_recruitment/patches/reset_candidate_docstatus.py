import frappe

def execute():
    count = frappe.db.count("DKP_Candidate", {"docstatus": ["in", [1, 2]]})
    
    if count > 0:
        frappe.db.sql("""
            UPDATE `tabDKP_Candidate`
            SET docstatus = 0
            WHERE docstatus IN (1, 2)
        """)
        frappe.db.commit()
        
        print(f"✅ {count} DKP_Candidate records converted to Draft")