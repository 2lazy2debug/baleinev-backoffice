# address list management

The address list is a critical piece of data for the organization to function properly. 
For the data definition, the guid / pk is deliberately being left out for convenience but it's going to be there.
Fields with * are mandatory 
The data definition of an address is quite easy  : 
- First name (* if company name empty)
- Last name
- Company name (* if first name empty)
- Address
- Country 
- ZIP (proposal from city table but not binding)
- City (proposal from city table but not binding)
- Telephone prefix (use a library if available)
- Telephone number
- email address
- Bank Account -> fk to bank account object (1 account to N bank accounts)
- Additional note 

City table : 
- ZIP
- City name 

Bank Account : 
- Display Name*
- Address
- NPA (proposal from city table but not binding)*
- City (proposal from city table but not binding)*
- Country*
- IBAN*

Behaviour when inputting a city :
- inputting a npa will show a dropdown of cities with the corresponding NPA
- inputting a city will show a dropdown of NPAs

## TODO 
- Create an address tab where no role besides being logged-in is required to view, add and edit addresses (no delete unless admin).
- The address creation, as for all the other apps, lives in a modal. please refer to CLAUDE.md for the design system rules.
- In the invoice app, it's possible to use an address from the address list to fill the address fields for the invoice
- In the invoice app, it's possible to create an address on the fly (bring up the create modal from the invoices app)
- Adresses are displayed in a table with :
first name & last name | company name | zip | city | email | prefix + phone | note 
- The table, which should resemble the journal one (with in-table filtering and editing controls) will allow to see the details of the address with the "view" icon used in other applications as well. 
-- On mobile, this is a table of cardlets 
- the entry should show the data relative to the address, with a table of the bank accounts ( display name | iban | controls to edit/delete) where bank accounts can be added below the header data. 

## Rules
- Don't make up new components unless it's needed (e.g. they don´t exist) : view / edit / delete / search controls are widely implemented and should be already available in a centralized space. 
- avoid hardcoding 
- if you must create a new component, make it as generic as possible to be reused
- update the docs as needed
- deploy to production with a new tag directly, don´t wait on the user instructing you so. 