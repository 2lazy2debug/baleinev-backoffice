# Stock management
Please create a new app for stock management. 
This application holds data in the following way (* = mandatory, no guid/pk for conveinence but elements have them )
- stock places : holds a name essentially
- element : name*, brand, unit (fk of units)*, unit_qty*, expireable (bool)* 
- unit : expandable enum list (already include l, ml, m, pce, m2, g, kg)

each stock place you can add an element and will hold those data 
stock_Elem : element*, qty*, expire_Date -> that means that 2 entries for the same element can exist with different expiry dates 
expire_date doesn't show up at all if expireable = no 
movement_log : stock, stock_Elem, delta, in/out (bool) 

feature set (all users): 
- stock is edition-independent!!!
- create elements
- add stock_element to stock -> if expiry date different, new stock_elem, otherwise add to quantity; add movement log
- remove stock_element to stock -> add movement log
- edit quantity of a stock_elem -> movement log


feature set admin only : 
- add/rename units , 
- add/remove stocks (ask where to move elements, no orphan elements allowed, so deletion allowed if only 1 stock and non-empty)

UI : 
Stock app : on first open the default screen is the stock selection. afterwards the stock can be switched with a box icon on the right of the new entry button
but the next time a user enters the stock app it sees the stock content directly (to avoid selectling the stock ).
the user will add to stock in different ways : 
- quantity -> edit button on the top right of the row unblocks it -> reclicking on it locks the new quantity -> logs change 
- +/- button around the quantity case -> always active -> always logs 
- new entry (usual modal with button) : pick the element, put initial quantity, expire date if applies

- on mobile : cardlets instead of table rows, but keep them tight. 


rules : 
- strictly conform to design system 
- conform to claude.md
- push automatically to production with the appropriate tag
- the names i put here are strictly technical : a user won´t add a "stock elem" it will just add a new item, this nomenclature is mostly for you and the database