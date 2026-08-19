# design consistency check and improvements
You recently implemented @docs/plans/done/003_design_system_update plan. 

## improvements before check
### sidebar collapse behaviour : 
- sign out label should be replaced with the sign out icon
- username should disappear
- the expand arrow should now lay between the settings icon and the sign out icon vertically
-- the three icons aforementioned should be aligned and same-sized

### text size in buttons
- text size in buttons should be reduced by 1 or 2 pts overall.

## consistency check and correction

when browsing the website, i can still see different button sizes. 
Eg : /events page : "new event type" and "new event" button differ in height

another issue, always in /events, sometimes elements aren't the same size in the same row : 
"name" "description" "new event type" aren´t consistent in height (the button has a smaller height)

please parse the codebase and ensure that : 
- hardcoded elements disappear as much as possible
- centralize components as indicated in the design system aforementioned
- make sure again that all elements across the platform are consistent to eachother. 