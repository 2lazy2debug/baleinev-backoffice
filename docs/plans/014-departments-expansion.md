## Departments expansion

Today, departments are just a transparent item that can´t be managed by the admin and is always strictly linked to a budget.. 
I need to have a department management : 
- department entry in the menu (just over users)
- only visible to admin 
- department has the following data (guid excluded for convenience purpose): 
-- name
-- abbreviation
-- has a budget (bool)
- department is edition independent, but budgets are 
- if a department has a budget, and the budget has either journal entries or budget entries, the budget can´t be deactivated for the department 
- apply the common template with table for desktop, cardlets for mobile
- new department button, no modal 

what that means for the current links : 
- users are linked to departmentsroles and departments already, but in the database i think it makes more sense to rename the correct entity as "DepartmentBudget". 

deferred : 
- per-app permissions with defined roles per department
