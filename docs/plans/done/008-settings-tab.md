# Settings tab -> Account tab

Today the Settings is just a popup with a couple of things to change. 

I want you to implement the settings as a new tab (desktop + mobile) that : 
- carries the bank information in a cardlet
- gives the possibility to edit the name 
- gives the possibility to change password 
- gives the possibility to request adhesion to a department (ui only at this point in time)
- gives the possibility to enroll 2FA (ui only at this point in time)

This new tab should be called "Account" rather than settings so a rename should be provided on the button. The button position and layout stay the same in the application but are swapped with an account icon and label "Account" ("Compte" in french)

The language switch should be moved to a button that opens a modal with the language switch, this button should lay between the Account and the "collapse" button. This button should replicate the layout of the collapse butotn but contain an icon with a globe (the intl icon).

On the department request cardlet and 2FA cardlet state a "available soon" label as per now. separate implementation plans will occur later. s