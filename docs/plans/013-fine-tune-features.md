# Fine-tune features

## Address app 
- mail and phone display labels are clickable (mailto: and call ) on the main card
- mobile : no need to wrap the addresses in an intermediate container (eats too much space)
- "viev address" -> should display data, not have it editable on the spot. enable edit with crayon icon on the card, top right
- add "Description" header and make it the first thing we see
- add a contact type dropdown that has the following items [sponsor, supplier, partner, artist, staff] -> blank is an option
-- admin can add a contact type through a settings app panel just like the stock application
- implement a search bar in the mobile view the same way it's implemented in passwords app

## Stock management 
- same principle as the address app, the container wrapping the "affichage 2/2" just eats space at this point

## Tasks app 
- drastically reduce padding/margin in the mobile version 

## events app 
- the "collapse" button should sit on the top right along with the title in the mobile version
- implement an app settings the same way it's done in the stock app to manage the event types and move them there. 

## users management
- when opening the app, the default view should be read-only. an edit button on each entry should display the current form with editable fields. the departments dropdown should be an inline list of departments in view mode (maybe in grey pills). 

## General
- If it's component-wise : drastically reduce margin/paddings in mobile versions because when we get drilled-down to the element item, already 20-25% of the space is eaten by padding and margin space. Ignore the precedent instructions about margin and paddings if that's the case and apply this globally instead. 
- automatically deploy with the appropriate tag. 