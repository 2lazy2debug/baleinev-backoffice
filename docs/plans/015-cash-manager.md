# Cash manager / POS
The Intranet supports the following things : 
- Journal for financial records (in/out)
- Cash accounts 
- Articles and stock management

What it lacks is a way to tie them together through a PoS system / cash manager. 
## Prerequirement : subplan 0
Prior to implementing it, one change must be performed at UI level (it kinda already exists at schema level) : Articles need their own application and a boolean for "has stock management" to allow to sell items for which stock isn't necessary (e.g. we will stock beer draft barrels but we won't stock beer glasses poured). 

The applet will be admin only at this point in time and it kind of already exists, it just needs to have its control taken out of the stock app and added to the sidebar. 

## Cash manager : subplan 1 
Implement the Cash manager app. The app allows to select the cash account we want to work with and create a register for an event (open a cash) : we input how much of each coin/bill we take out, it creates a journal for that. At the end of an event or a shift we can input what is still in the register at the end. at this point we don't write anything to the journal yet. 
Possible values : CHF : 0.05, 0.10 , 0.20, 0.50, 1.00, 2.00, 5.00, 10.00, 20.00, 50.00 , 100.00 , 200.00 (we don't accept 1000)

## POS : subplan 2
Now that we have the cash manager app, we might as well tie this together with a POS app. The app will be able to do the following : 
- Create a POS template with articles we're going to sell : 
-- UI is a 3x3 grid with pagination
-- We pick the article per each cell and add a price. Negative amount is allowed (e.g. a return)
-- The last element is always "Custom sale" to allow to feed in a custom amount etc
- Open/Pause/Close a POS session : We pick the template and open a session. 
-- There is a sessions (list icon) on top right of the screen to manage sessions. multiple sessions are allowed as well as having 2 phones joining the same session
-- Pick payment means (multiple select, at least one ): Twint, Bank, register (one per POS session).
- During a session workflow : 
-- the UI has : 3x3 grid and underneath it has "list" and "checkout" : 
--- List opens a modal with the list of articles with +/-/bin icons with add/substract/remove item actions
--- checkout lists the payment options and helps the user to close the transaction
-- pick the articles, tell the total price, the app asks for cash/other.
-- before clicking on checkout, on a list 
--- if other : nothing else to do besides validating the sale. : Sold / Cancel 
---- Cancel comes back to the grid 
--- if cash : input the given amount and the software will tell what coins to give back (optimized for less coins). 
-- on closing a session : we inject in the cash register journal the remaining amount accourding to the operations done but we don't close it. 

## POS : subplan 3 
- POS sessions are recorded : each transaction, mean of payment, and if cash, what has been told to give back

## cash register : subplan 4 
- When everything else is implemented, when closing a cash section, the admin must be able to automatically generate a journal entry, actually 3: 
- take money out to create a cash register
- take money in to fill back the account 
- a record with the difference between what the software calculated and what is in the cash register as "User correction "
e.g. : 
we take 5x of each coin/bill 
software calculates at the end 3x each coin/bill 
there is 3x for all except a 10 bill, so there's 2 of it : 
- expense of 5x each as total amount 
- revenue 3x each as total amount
- expense of 10.- of user correction 

